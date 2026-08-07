import {
	BadRequestException,
	Injectable,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { basename, extname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { BucketR2Service } from 'src/modules/bucket2/services/bucket-r2.service';
import { Tenant } from 'src/modules/tenant/tenant.entity';
import { ImportJobSourceType } from 'src/modules/etl/interfaces';
import { ImportJobsService } from 'src/modules/etl/services/import-jobs/import-jobs.service';
import { DataSource, In, Not, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import {
	ASSET_IMPORT_ALLOWED_EXTENSIONS,
	ASSET_IMPORT_ITEM_CHUNK_SIZE,
	ASSET_IMPORT_PRESIGN_EXPIRES_IN,
	ASSET_IMPORT_R2_PREFIX,
	ASSET_IMPORT_SCAN_SYNC_THRESHOLD,
} from '../constants/asset-import.constant';
import {
	ApplyAssetImportDto,
	PresignAssetImportDto,
	ScanAssetImportDto,
} from '../dto/asset-import.dto';
import { AssetImportBatch } from '../entities/asset-import-batch.entity';
import { AssetImportItem } from '../entities/asset-import-item.entity';
import {
	AssetImportBatchStatus,
	AssetImportItemStatus,
} from '../enum/asset-import.enum';
import {
	AssetImportOptions,
	AssetImportScanSummary,
	ScannedAssetRow,
} from '../interfaces/asset-import.interface';
import { AssetImportApplyService } from './asset-import-apply.service';
import { AssetImportParserService } from './asset-import-parser.service';
import { AssetImportScanService } from './asset-import-scan.service';

const DEFAULT_OPTIONS: AssetImportOptions = {
	updateOwnership: true,
	overwriteMetadata: false,
	createIfNotFound: false,
	fillEmptyOnly: false,
	createLabelIfMissing: false,
};

@Injectable()
export class AssetImportService {
	private readonly logger = new Logger(AssetImportService.name);

	constructor(
		@InjectRepository(AssetImportBatch)
		private readonly batchRepo: Repository<AssetImportBatch>,
		@InjectRepository(AssetImportItem)
		private readonly itemRepo: Repository<AssetImportItem>,
		private readonly dataSource: DataSource,
		private readonly parserService: AssetImportParserService,
		private readonly scanService: AssetImportScanService,
		private readonly applyService: AssetImportApplyService,
		private readonly importJobsService: ImportJobsService,
		private readonly r2Service: BucketR2Service,
	) {}

	// ── SCAN ──────────────────────────────────────────────────────────

	/**
	 * Cấp presigned URL để FE upload thẳng file lên R2, không đẩy qua body API.
	 * File assets có thể rất nặng nên đi qua server sẽ phình payload.
	 */
	async presignUpload(
		dto: PresignAssetImportDto,
	): Promise<{ r2Key: string; uploadUrl: string; expiresIn: number }> {
		const fileName = basename(dto.fileName.trim());
		const ext = extname(fileName).toLowerCase();

		if (!ASSET_IMPORT_ALLOWED_EXTENSIONS.includes(ext)) {
			throw new BadRequestException(
				`Chỉ chấp nhận file ${ASSET_IMPORT_ALLOWED_EXTENSIONS.join(', ')}`,
			);
		}

		// uuid trong key để hai lần upload cùng tên file không đè lên nhau.
		const r2Key = `${ASSET_IMPORT_R2_PREFIX}${uuidv4()}/${fileName}`;
		const uploadUrl = await this.r2Service.getSignedUrlUpload({
			key: r2Key,
			isPublic: false,
			contentType: dto.contentType || 'application/octet-stream',
		});

		return {
			r2Key,
			uploadUrl,
			expiresIn: ASSET_IMPORT_PRESIGN_EXPIRES_IN,
		};
	}

	/**
	 * Parse file, tạo batch, đối chiếu với hệ thống và ghi từng dòng thành item.
	 *
	 * File nhỏ chạy đồng bộ để người dùng thấy kết quả ngay; file lớn trả
	 * batchId + jobId rồi quét nền, FE theo dõi qua SSE hoặc poll.
	 */
	async scan(
		dto: ScanAssetImportDto,
		userId: string,
	): Promise<{
		batchId: string;
		jobId: string;
		status: AssetImportBatchStatus;
		summary: AssetImportScanSummary | null;
	}> {
		await this.assertTenantExists(dto.targetTenantId);

		const buffer = await this.readUploadedFile(dto.r2Key);
		const fileName = basename(dto.r2Key);

		const rows = this.parserService.parse(buffer);
		const options: AssetImportOptions = {
			...DEFAULT_OPTIONS,
			...(dto.options ?? {}),
		};

		const job = await this.importJobsService.create({
			sourceType: ImportJobSourceType.ASSET_IMPORT_SCAN,
			fileName,
			fileSizeBytes: buffer.length,
			progressTotal: rows.length,
			tenantId: dto.targetTenantId,
			createdBy: userId,
			params: {
				targetTenantId: dto.targetTenantId,
				r2Key: dto.r2Key,
				options,
			},
		});

		const batch = await this.batchRepo.save(
			this.batchRepo.create({
				fileName,
				fileHash: createHash('sha256').update(buffer).digest('hex'),
				targetTenantId: dto.targetTenantId,
				// Label luôn lấy theo cột Label Name trong file; cột này giữ lại
				// cho dữ liệu batch cũ nên từ nay luôn null.
				targetLabelId: null,
				options,
				status: AssetImportBatchStatus.SCANNING,
				totalRows: rows.length,
				scanJobId: job.id,
				requestedBy: userId,
			}),
		);

		const runScan = async () => {
			await this.importJobsService.markProcessing(job.id);
			const { items, summary } = await this.scanService.scan(rows, {
				targetTenantId: dto.targetTenantId,
				options,
			});
			await this.persistItems(batch.id, items, job.id);

			await this.batchRepo.update(batch.id, {
				status: AssetImportBatchStatus.SCANNED,
				matchedRows: summary.matched,
				newRows: summary.new,
				invalidRows: summary.invalid,
				scannedAt: new Date(),
			});
			await this.importJobsService.markCompleted(job.id, { ...summary });
			return summary;
		};

		if (rows.length <= ASSET_IMPORT_SCAN_SYNC_THRESHOLD) {
			try {
				const summary = await runScan();
				return {
					batchId: batch.id,
					jobId: job.id,
					status: AssetImportBatchStatus.SCANNED,
					summary,
				};
			} catch (err: any) {
				await this.failBatch(batch.id, job.id, err);
				throw err;
			}
		}

		void runScan().catch((err) => this.failBatch(batch.id, job.id, err));

		return {
			batchId: batch.id,
			jobId: job.id,
			status: AssetImportBatchStatus.SCANNING,
			summary: null,
		};
	}

	private async persistItems(
		batchId: string,
		items: ScannedAssetRow[],
		jobId: string,
	): Promise<void> {
		for (let i = 0; i < items.length; i += ASSET_IMPORT_ITEM_CHUNK_SIZE) {
			const chunk = items.slice(i, i + ASSET_IMPORT_ITEM_CHUNK_SIZE);
			// insert() thay vì save(): không cần load lại entity sau khi ghi.
			// Cast vì TypeORM coi jsonb Record<string, unknown> là nhánh lồng nhau.
			await this.itemRepo.insert(
				chunk.map((row) => ({
					batchId,
					rowNumber: row.rowNumber,
					rawData: row.raw,
					isrc: row.isrc,
					upc: row.upc,
					trackName: row.trackName,
					albumName: row.albumName,
					labelName: row.labelName,
					matchType: row.matchType,
					action: row.action,
					matchedReleaseId: row.matchedReleaseId,
					matchedTrackId: row.matchedTrackId,
					currentTenantId: row.currentTenantId,
					currentLabelId: row.currentLabelId,
					changes: row.changes,
					status: AssetImportItemStatus.PENDING,
					errorMessage: row.errorMessage,
				})) as unknown as QueryDeepPartialEntity<AssetImportItem>[],
			);

			await this.importJobsService.updateProgress(jobId, {
				progressCurrent: Math.min(i + chunk.length, items.length),
				progressLabel: `Đã quét ${Math.min(i + chunk.length, items.length)}/${items.length} dòng`,
				processedRows: Math.min(i + chunk.length, items.length),
			});
		}
	}

	// ── APPLY ─────────────────────────────────────────────────────────

	/**
	 * Convert những item người dùng chọn. Luôn chạy nền vì mỗi item là một
	 * transaction riêng và số lượng có thể lên tới hàng nghìn.
	 */
	async apply(
		batchId: string,
		dto: ApplyAssetImportDto,
		userId: string,
	): Promise<{ batchId: string; jobId: string; totalSelected: number }> {
		const batch = await this.getBatchOrFail(batchId);

		if (batch.status === AssetImportBatchStatus.APPLYING) {
			throw new BadRequestException('Batch đang được apply, chờ chạy xong');
		}
		if (batch.status === AssetImportBatchStatus.SCANNING) {
			throw new BadRequestException('Batch đang quét, chưa apply được');
		}
		if (batch.status === AssetImportBatchStatus.CANCELLED) {
			throw new BadRequestException('Batch đã bị huỷ');
		}

		const items = await this.selectItems(batchId, dto);
		if (!items.length) {
			throw new BadRequestException(
				'Không có item nào ở trạng thái PENDING khớp lựa chọn',
			);
		}

		const job = await this.importJobsService.create({
			sourceType: ImportJobSourceType.ASSET_IMPORT_APPLY,
			fileName: batch.fileName,
			progressTotal: items.length,
			tenantId: batch.targetTenantId,
			createdBy: userId,
			params: { batchId, itemCount: items.length },
		});

		await this.batchRepo.update(batchId, {
			status: AssetImportBatchStatus.APPLYING,
			applyJobId: job.id,
			appliedBy: userId,
		});

		void this.runApply(batch, items, job.id, userId).catch((err) =>
			this.failBatch(batchId, job.id, err),
		);

		return { batchId, jobId: job.id, totalSelected: items.length };
	}

	private async runApply(
		batch: AssetImportBatch,
		items: AssetImportItem[],
		jobId: string,
		userId: string,
	): Promise<void> {
		await this.importJobsService.markProcessing(jobId);

		// applyJobId vừa được ghi sau khi batch được đọc, cập nhật lại bản trong
		// bộ nhớ để release/track tạo mới mang đúng importJobId.
		batch.applyJobId = jobId;

		let applied = 0;
		let failed = 0;
		let skipped = 0;

		for (const [index, item] of items.entries()) {
			const result = await this.applyService.applyItem(item, batch, userId);

			await this.itemRepo.update(item.id, {
				status: result.status,
				errorMessage: result.errorMessage,
				appliedAt:
					result.status === AssetImportItemStatus.APPLIED
						? new Date()
						: null,
			});

			if (result.status === AssetImportItemStatus.APPLIED) applied++;
			else if (result.status === AssetImportItemStatus.FAILED) failed++;
			else skipped++;

			await this.importJobsService.updateProgress(jobId, {
				progressCurrent: index + 1,
				progressLabel: `Đã xử lý ${index + 1}/${items.length} item`,
				processedRows: applied,
				skippedRows: skipped,
				errorRows: failed,
			});
		}

		// Cộng dồn với lần apply trước để hỗ trợ apply nhiều đợt trên cùng batch.
		const totals = await this.countByStatus(batch.id);
		const status =
			totals.pending > 0 || failed > 0
				? AssetImportBatchStatus.PARTIALLY_APPLIED
				: AssetImportBatchStatus.APPLIED;

		await this.batchRepo.update(batch.id, {
			status,
			appliedRows: totals.applied,
			failedRows: totals.failed,
			appliedAt: new Date(),
			appliedBy: userId,
		});

		await this.importJobsService.markCompleted(jobId, {
			appliedRows: applied,
			failedRows: failed,
			skippedRows: skipped,
		});

		this.logger.log(
			`Batch ${batch.id} apply xong: applied=${applied}, failed=${failed}, skipped=${skipped}`,
		);
	}

	/** Chọn item theo itemIds, hoặc theo selectAll + filter trừ excludeItemIds. */
	private async selectItems(
		batchId: string,
		dto: ApplyAssetImportDto,
	): Promise<AssetImportItem[]> {
		if (!dto.selectAll) {
			if (!dto.itemIds?.length) {
				throw new BadRequestException(
					'Cần itemIds khi selectAll = false',
				);
			}
			return this.itemRepo.find({
				where: {
					batchId,
					id: In(dto.itemIds),
					status: AssetImportItemStatus.PENDING,
				},
				order: { rowNumber: 'ASC' },
			});
		}

		return this.itemRepo.find({
			where: {
				batchId,
				status: AssetImportItemStatus.PENDING,
				...(dto.action ? { action: dto.action } : {}),
				...(dto.excludeItemIds?.length
					? { id: Not(In(dto.excludeItemIds)) }
					: {}),
			},
			order: { rowNumber: 'ASC' },
		});
	}

	private async countByStatus(batchId: string) {
		const raw = await this.itemRepo
			.createQueryBuilder('item')
			.select('item.status', 'status')
			.addSelect('COUNT(*)', 'count')
			.where('item.batchId = :batchId', { batchId })
			.groupBy('item.status')
			.getRawMany<{ status: AssetImportItemStatus; count: string }>();

		const get = (status: AssetImportItemStatus) =>
			Number(raw.find((r) => r.status === status)?.count ?? 0);

		return {
			applied: get(AssetImportItemStatus.APPLIED),
			failed: get(AssetImportItemStatus.FAILED),
			skipped: get(AssetImportItemStatus.SKIPPED),
			pending: get(AssetImportItemStatus.PENDING),
		};
	}

	// ── Huỷ batch ─────────────────────────────────────────────────────

	async cancel(batchId: string): Promise<void> {
		const batch = await this.getBatchOrFail(batchId);

		if (batch.status === AssetImportBatchStatus.APPLYING) {
			throw new BadRequestException('Batch đang apply, không huỷ được');
		}

		const applied = await this.itemRepo.count({
			where: { batchId, status: AssetImportItemStatus.APPLIED },
		});
		if (applied > 0) {
			throw new BadRequestException(
				`Batch đã apply ${applied} item nên không huỷ được. Xem lịch sử để đối chiếu.`,
			);
		}

		await this.batchRepo.update(batchId, {
			status: AssetImportBatchStatus.CANCELLED,
		});
	}

	// ── Helper ────────────────────────────────────────────────────────

	async getBatchOrFail(batchId: string): Promise<AssetImportBatch> {
		const batch = await this.batchRepo.findOne({ where: { id: batchId } });
		if (!batch) {
			throw new NotFoundException(`Không tìm thấy batch ${batchId}`);
		}
		return batch;
	}

	private async assertTenantExists(tenantId: string): Promise<void> {
		const tenantExists = await this.dataSource
			.getRepository(Tenant)
			.exists({ where: { id: tenantId } });
		if (!tenantExists) {
			throw new BadRequestException(
				`Workspace ${tenantId} không tồn tại`,
			);
		}
	}

	/**
	 * Tải file người dùng đã upload lên R2. Chỉ chấp nhận key trong thư mục
	 * asset-import/ để không đọc được object tuỳ ý trong bucket.
	 */
	private async readUploadedFile(r2Key: string): Promise<Buffer> {
		const key = r2Key.trim();

		if (!key.startsWith(ASSET_IMPORT_R2_PREFIX) || key.includes('..')) {
			throw new BadRequestException(
				`r2Key phải nằm trong thư mục ${ASSET_IMPORT_R2_PREFIX}`,
			);
		}

		const ext = extname(key).toLowerCase();
		if (!ASSET_IMPORT_ALLOWED_EXTENSIONS.includes(ext)) {
			throw new BadRequestException(
				`Chỉ chấp nhận file ${ASSET_IMPORT_ALLOWED_EXTENSIONS.join(', ')}`,
			);
		}

		const bucketName = this.r2Service.getBucketName({ isPublic: false });

		try {
			return await this.r2Service.getObjectBuffer({ bucketName, key });
		} catch (err: any) {
			this.logger.warn(`Không đọc được ${key} trên R2: ${err.message}`);
			throw new BadRequestException(
				'Chưa upload file lên R2 hoặc r2Key sai',
			);
		}
	}

	private async failBatch(
		batchId: string,
		jobId: string,
		err: Error,
	): Promise<void> {
		this.logger.error(`Batch ${batchId} thất bại: ${err.message}`, err.stack);
		await this.batchRepo.update(batchId, {
			status: AssetImportBatchStatus.FAILED,
			errorMessage: err.message,
		});
		await this.importJobsService.markFailed(jobId, err);
	}
}
