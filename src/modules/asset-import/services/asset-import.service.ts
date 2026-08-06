import {
	BadRequestException,
	Injectable,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Label } from 'src/modules/label/entities/label.entity';
import { Tenant } from 'src/modules/tenant/tenant.entity';
import { ImportJobSourceType } from 'src/modules/etl/interfaces';
import { ImportJobsService } from 'src/modules/etl/services/import-jobs/import-jobs.service';
import { DataSource, In, Not, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import {
	ASSET_IMPORT_ITEM_CHUNK_SIZE,
	ASSET_IMPORT_SCAN_SYNC_THRESHOLD,
} from '../constants/asset-import.constant';
import { ApplyAssetImportDto, ScanAssetImportDto } from '../dto/asset-import.dto';
import { AssetImportBatch } from '../entities/asset-import-batch.entity';
import { AssetImportItem } from '../entities/asset-import-item.entity';
import {
	AssetImportAction,
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
	) {}

	// ── SCAN ──────────────────────────────────────────────────────────

	/**
	 * Parse file, tạo batch, đối chiếu với hệ thống và ghi từng dòng thành item.
	 *
	 * File nhỏ chạy đồng bộ để người dùng thấy kết quả ngay; file lớn trả
	 * batchId + jobId rồi quét nền, FE theo dõi qua SSE hoặc poll.
	 */
	async scan(
		file: { originalname?: string; buffer: Buffer; size?: number },
		dto: ScanAssetImportDto,
		userId: string,
	): Promise<{
		batchId: string;
		jobId: string;
		status: AssetImportBatchStatus;
		summary: AssetImportScanSummary | null;
	}> {
		const targetLabelId = dto.targetLabelId?.trim() || null;
		await this.assertTargetsExist(dto.targetTenantId, targetLabelId);

		const rows = this.parserService.parse(file.buffer);
		const options: AssetImportOptions = {
			...DEFAULT_OPTIONS,
			...(dto.options ?? {}),
		};

		const job = await this.importJobsService.create({
			sourceType: ImportJobSourceType.ASSET_IMPORT_SCAN,
			fileName: file.originalname ?? '',
			fileSizeBytes: file.size ?? file.buffer.length,
			progressTotal: rows.length,
			tenantId: dto.targetTenantId,
			createdBy: userId,
			params: {
				targetTenantId: dto.targetTenantId,
				targetLabelId,
				options,
			},
		});

		const batch = await this.batchRepo.save(
			this.batchRepo.create({
				fileName: file.originalname ?? 'unknown',
				fileHash: createHash('sha256').update(file.buffer).digest('hex'),
				targetTenantId: dto.targetTenantId,
				targetLabelId,
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
				targetLabelId,
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

	private async assertTargetsExist(
		tenantId: string,
		labelId?: string | null,
	): Promise<void> {
		const tenantExists = await this.dataSource
			.getRepository(Tenant)
			.exists({ where: { id: tenantId } });
		if (!tenantExists) {
			throw new BadRequestException(
				`Workspace ${tenantId} không tồn tại`,
			);
		}

		if (!labelId) return;

		// Label phải thuộc đúng workspace đích, tránh gán chéo tenant.
		const labelExists = await this.dataSource
			.getRepository(Label)
			.exists({ where: { id: labelId, tenantId } });
		if (!labelExists) {
			throw new BadRequestException(
				`Label ${labelId} không thuộc workspace ${tenantId}`,
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
