import {
	BadRequestException,
	Injectable,
	Logger,
	NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { basename, extname } from 'path';
import { BucketR2Service } from 'src/modules/bucket2/services/bucket-r2.service';
import { ImportJobSourceType } from 'src/modules/etl/interfaces';
import { ImportJobsService } from 'src/modules/etl/services/import-jobs/import-jobs.service';
import { ReleaseMergeService } from 'src/modules/release-merge/services/release-merge.service';
import { Tenant } from 'src/modules/tenant/tenant.entity';
import { DataSource, In, Not, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { v4 as uuidv4 } from 'uuid';
import {
	ASSET_IMPORT_ALLOWED_EXTENSIONS,
	ASSET_IMPORT_ITEM_CHUNK_SIZE,
	ASSET_IMPORT_PRESIGN_EXPIRES_IN,
	ASSET_IMPORT_R2_PREFIX,
	ASSET_IMPORT_SCAN_SYNC_THRESHOLD,
	ASSET_IMPORT_TEMPLATE_FILE_NAME,
	ASSET_IMPORT_TEMPLATE_R2_KEY,
} from '../constants/asset-import.constant';
import {
	ApplyAssetImportDto,
	MergeAssetImportDuplicatesDto,
	PresignAssetImportDto,
	ScanAssetImportDto,
} from '../dto/asset-import.dto';
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
	ParsedAssetRow,
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
		private readonly releaseMergeService: ReleaseMergeService,
		private readonly importJobsService: ImportJobsService,
		private readonly r2Service: BucketR2Service,
	) {}

	/** Trả presigned URL tải template Excel từ protected R2 bucket. */
	async getTemplateDownloadUrl(): Promise<string> {
		return this.r2Service.getSignedUrlDown({
			key: ASSET_IMPORT_TEMPLATE_R2_KEY,
			isPublic: false,
			fileName: ASSET_IMPORT_TEMPLATE_FILE_NAME,
		});
	}

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

		const fileKey = dto.r2Key.trim();
		const buffer = await this.readUploadedFile(fileKey);
		const fileName = basename(fileKey);

		const rows = this.parserService.parse(buffer);
		const options: AssetImportOptions = {
			...DEFAULT_OPTIONS,
			...(dto.options ?? {}),
		};
		const effectiveDate = this.normalizeDate(
			dto.effectiveDate ?? new Date().toISOString().slice(0, 10),
			'effectiveDate',
		);
		const revenueEffectiveFrom = this.normalizeRevenueMonth(
			dto.revenueEffectiveFrom ?? effectiveDate,
		);

		const job = await this.importJobsService.create({
			sourceType: ImportJobSourceType.ASSET_IMPORT_SCAN,
			fileName,
			fileSizeBytes: buffer.length,
			progressTotal: rows.length,
			tenantId: dto.targetTenantId,
			createdBy: userId,
			params: {
				targetTenantId: dto.targetTenantId,
				r2Key: fileKey,
				options,
				effectiveDate,
				revenueEffectiveFrom,
			},
		});

		const batch = await this.batchRepo.save(
			this.batchRepo.create({
				fileName,
				fileKey,
				fileHash: createHash('sha256').update(buffer).digest('hex'),
				targetTenantId: dto.targetTenantId,
				// Label luôn lấy theo cột Label Name trong file; cột này giữ lại
				// cho dữ liệu batch cũ nên từ nay luôn null.
				targetLabelId: null,
				effectiveDate,
				revenueEffectiveFrom,
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
					duplicateClassification: row.duplicateClassification,
					canonicalReleaseId: row.canonicalReleaseId,
					canonicalTrackId: row.canonicalTrackId,
					duplicateSourceReleaseIds: row.duplicateSourceReleaseIds,
					requiresMerge: row.requiresMerge,
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

	private normalizeDate(value: string, field: string): string {
		if (
			!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
			Number.isNaN(Date.parse(value))
		) {
			throw new BadRequestException(`${field} phải có dạng YYYY-MM-DD`);
		}
		return value;
	}

	private normalizeRevenueMonth(value: string): string {
		const date = this.normalizeDate(value, 'revenueEffectiveFrom');
		return `${date.slice(0, 7)}-01`;
	}

	async getMergeImpact(batchId: string) {
		await this.getBatchOrFail(batchId);
		const items = await this.itemRepo.find({
			where: {
				batchId,
				action: AssetImportAction.MERGE_REQUIRED,
				status: AssetImportItemStatus.PENDING,
			},
			order: { rowNumber: 'ASC' },
		});
		const groups = new Map<
			string,
			{
				targetReleaseId: string;
				sourceReleaseIds: Set<string>;
				itemIds: string[];
				isrcs: Set<string>;
			}
		>();
		for (const item of items) {
			if (!item.canonicalReleaseId) continue;
			const group = groups.get(item.canonicalReleaseId) ?? {
				targetReleaseId: item.canonicalReleaseId,
				sourceReleaseIds: new Set<string>(),
				itemIds: [],
				isrcs: new Set<string>(),
			};
			(item.duplicateSourceReleaseIds ?? []).forEach((id) =>
				group.sourceReleaseIds.add(id),
			);
			group.itemIds.push(item.id);
			if (item.isrc) group.isrcs.add(item.isrc);
			groups.set(item.canonicalReleaseId, group);
		}
		const detailedGroups = [];
		for (const group of groups.values()) {
			const sources = [];
			for (const sourceReleaseId of group.sourceReleaseIds) {
				try {
					const plan = await this.releaseMergeService.preparePair(
						sourceReleaseId,
						group.targetReleaseId,
					);
					sources.push({
						sourceReleaseId,
						plan,
						forceEligible:
							this.releaseMergeService.isForceEligible(plan),
						error: null,
					});
				} catch (error: any) {
					sources.push({
						sourceReleaseId,
						plan: null,
						forceEligible: false,
						error: error.message,
					});
				}
			}
			detailedGroups.push({
				targetReleaseId: group.targetReleaseId,
				itemIds: group.itemIds,
				isrcs: [...group.isrcs],
				sources,
			});
		}

		return {
			totalItems: items.length,
			totalTargets: groups.size,
			groups: detailedGroups,
		};
	}

	/**
	 * Gộp các cặp release rồi rescan. Chạy nền: proxy Next của `/api/v1` cắt
	 * request sau 30 giây và trả 500 dù handler còn chạy.
	 */
	async mergeDuplicates(
		batchId: string,
		dto: MergeAssetImportDuplicatesDto,
		userId: string,
	): Promise<{
		batchId: string;
		jobId: string;
		totalPairs: number;
	}> {
		const batch = await this.getBatchOrFail(batchId);
		this.assertBatchIdle(batch);
		if (dto.force && !dto.sourceReleaseIds?.length) {
			throw new BadRequestException(
				'Cần sourceReleaseIds khi force merge để tránh merge nhầm cả batch',
			);
		}

		const pairs = await this.collectMergePairs(batchId, dto);
		if (!pairs.length) {
			throw new BadRequestException(
				'Không có cặp release MERGE_REQUIRED phù hợp',
			);
		}

		const previousStatus = batch.status;
		const job = await this.importJobsService.create({
			sourceType: ImportJobSourceType.ASSET_IMPORT_MERGE,
			fileName: batch.fileName,
			progressTotal: pairs.length,
			tenantId: batch.targetTenantId,
			createdBy: userId,
			params: {
				batchId,
				totalPairs: pairs.length,
				force: dto.force,
				sourceReleaseIds: dto.sourceReleaseIds ?? [],
			},
		});

		await this.batchRepo.update(batchId, {
			status: AssetImportBatchStatus.APPLYING,
			applyJobId: job.id,
			errorMessage: null,
		});

		void this.runMerge(
			batchId,
			pairs,
			job.id,
			userId,
			previousStatus,
			dto.force,
		).catch((err) => {
			this.logger.error(
				`Batch ${batchId} merge lỗi ngoài job: ${this.errorText(err)}`,
			);
		});

		return { batchId, jobId: job.id, totalPairs: pairs.length };
	}

	async rescanConflicts(batchId: string) {
		const batch = await this.getBatchOrFail(batchId);
		this.assertBatchIdle(batch);
		return this.rescanPendingConflicts(batch);
	}

	private assertBatchIdle(batch: AssetImportBatch): void {
		if (
			batch.status === AssetImportBatchStatus.APPLYING ||
			batch.status === AssetImportBatchStatus.SCANNING
		) {
			throw new BadRequestException(
				'Batch đang được xử lý, chờ chạy xong',
			);
		}
		if (batch.status === AssetImportBatchStatus.CANCELLED) {
			throw new BadRequestException('Batch đã bị huỷ');
		}
	}

	/** Một cặp release, không phải một dòng file. Không load rawData. */
	private async collectMergePairs(
		batchId: string,
		dto: MergeAssetImportDuplicatesDto,
	): Promise<{ sourceReleaseId: string; targetReleaseId: string }[]> {
		const params: unknown[] = [batchId];
		let idFilter = '';
		if (dto.selectAll) {
			if (dto.excludeItemIds?.length) {
				params.push(dto.excludeItemIds);
				idFilter = `AND id <> ALL($${params.length}::uuid[])`;
			}
		} else {
			if (!dto.itemIds?.length) {
				throw new BadRequestException(
					'Cần itemIds khi selectAll = false',
				);
			}
			params.push(dto.itemIds);
			idFilter = `AND id = ANY($${params.length}::uuid[])`;
		}
		let sourceFilter = '';
		if (dto.sourceReleaseIds?.length) {
			params.push(dto.sourceReleaseIds);
			sourceFilter = `AND src = ANY($${params.length}::text[])`;
		}

		const rows: { sourceReleaseId: string; targetReleaseId: string }[] =
			await this.dataSource.query(
				`SELECT DISTINCT
				   src AS "sourceReleaseId",
				   canonical_release_id::text AS "targetReleaseId"
				 FROM asset_import_items
				 CROSS JOIN LATERAL jsonb_array_elements_text(
				   COALESCE(duplicate_source_release_ids, '[]'::jsonb)
				 ) AS src
				 WHERE batch_id = $1
				   AND action = 'MERGE_REQUIRED'
				   AND status = 'PENDING'
				   AND canonical_release_id IS NOT NULL
				   AND src <> ''
				   ${idFilter}
				   ${sourceFilter}`,
				params,
			);
		return rows;
	}

	private async runMerge(
		batchId: string,
		pairs: { sourceReleaseId: string; targetReleaseId: string }[],
		jobId: string,
		userId: string,
		previousStatus: AssetImportBatchStatus,
		force = false,
	): Promise<void> {
		let merged = 0;
		let failed = 0;
		const errors: string[] = [];

		try {
			await this.importJobsService.markProcessing(jobId);

			for (const [index, pair] of pairs.entries()) {
				try {
					await this.releaseMergeService.apply({
						sourceReleaseId: pair.sourceReleaseId,
						targetReleaseId: pair.targetReleaseId,
						userId,
						force,
					});
					merged++;
				} catch (error) {
					failed++;
					if (errors.length < 20) {
						errors.push(
							`${pair.sourceReleaseId} -> ${pair.targetReleaseId}: ${this.errorText(error)}`,
						);
					}
				}

				await this.importJobsService.updateProgress(jobId, {
					progressCurrent: index + 1,
					progressTotal: pairs.length,
					progressLabel: `Đã xử lý ${index + 1}/${pairs.length} cặp release`,
					processedRows: merged,
					errorRows: failed,
					totalRows: pairs.length,
				});
			}

			await this.importJobsService.updateProgress(
				jobId,
				{
					progressCurrent: pairs.length,
					progressTotal: pairs.length,
					progressLabel: 'Đang quét lại các dòng conflict',
					processedRows: merged,
					errorRows: failed,
					totalRows: pairs.length,
				},
				true,
			);

			const batch = await this.getBatchOrFail(batchId);
			const rescan = await this.rescanPendingConflicts(batch);
			await this.batchRepo.update(batchId, {
				status: previousStatus,
				errorMessage: null,
			});
			await this.importJobsService.markCompleted(jobId, {
				merged,
				failed,
				rescanned: rescan.rescanned,
				errors,
			});
			this.logger.log(
				`Batch ${batchId} merge xong: merged=${merged}, failed=${failed}, rescanned=${rescan.rescanned}`,
			);
		} catch (error) {
			const message = this.errorText(error);
			this.logger.error(`Batch ${batchId} merge thất bại: ${message}`);
			await this.batchRepo.update(batchId, {
				status: previousStatus,
				errorMessage: message,
			});
			await this.importJobsService.markFailed(jobId, message);
		}
	}

	private errorText(error: unknown): string {
		if (error instanceof Error) return error.message;
		return String(error);
	}

	private async rescanPendingConflicts(batch: AssetImportBatch) {
		const batchId = batch.id;
		const items = await this.itemRepo.find({
			where: {
				batchId,
				action: In([
					AssetImportAction.MERGE_REQUIRED,
					AssetImportAction.CONFLICT,
				]),
				status: AssetImportItemStatus.PENDING,
			},
			order: { rowNumber: 'ASC' },
		});
		if (!items.length) return { rescanned: 0, summary: null };

		const rows: ParsedAssetRow[] = items.map((item) => ({
			rowNumber: item.rowNumber,
			raw: item.rawData,
			isrc: item.isrc,
			upc: item.upc,
			trackName: item.trackName,
			albumName: item.albumName,
			labelName: item.labelName,
		}));
		const { items: rescannedItems, summary } = await this.scanService.scan(
			rows,
			{
				targetTenantId: batch.targetTenantId,
				options: batch.options,
			},
		);
		const existingByRow = new Map(
			items.map((item) => [item.rowNumber, item]),
		);
		for (const row of rescannedItems) {
			const existing = existingByRow.get(row.rowNumber);
			if (!existing) continue;
			await this.itemRepo.update(existing.id, {
				matchType: row.matchType,
				action: row.action,
				matchedReleaseId: row.matchedReleaseId,
				matchedTrackId: row.matchedTrackId,
				currentTenantId: row.currentTenantId,
				currentLabelId: row.currentLabelId,
				duplicateClassification: row.duplicateClassification,
				canonicalReleaseId: row.canonicalReleaseId,
				canonicalTrackId: row.canonicalTrackId,
				duplicateSourceReleaseIds: row.duplicateSourceReleaseIds,
				requiresMerge: row.requiresMerge,
				changes: row.changes,
				errorMessage: row.errorMessage,
				rescannedAt: new Date(),
			});
		}
		const [counts] = await this.dataSource.query(
			`SELECT
			   COUNT(*) FILTER (
			     WHERE matched_release_id IS NOT NULL OR canonical_release_id IS NOT NULL
			   )::int AS matched_rows,
			   COUNT(*) FILTER (WHERE action = 'CREATE')::int AS new_rows,
			   COUNT(*) FILTER (WHERE action = 'INVALID')::int AS invalid_rows
			 FROM asset_import_items
			 WHERE batch_id = $1`,
			[batchId],
		);
		await this.batchRepo.update(batchId, {
			matchedRows: Number(counts?.matched_rows ?? 0),
			newRows: Number(counts?.new_rows ?? 0),
			invalidRows: Number(counts?.invalid_rows ?? 0),
			scannedAt: new Date(),
		});
		return { rescanned: rescannedItems.length, summary };
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
			throw new BadRequestException(
				'Batch đang được apply, chờ chạy xong',
			);
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
				dto.retryFailed
					? 'Không có item nào ở trạng thái PENDING hoặc FAILED để retry khớp lựa chọn'
					: 'Không có item nào ở trạng thái PENDING khớp lựa chọn',
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
			const result = await this.applyService.applyItem(
				item,
				batch,
				userId,
			);

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
		const selectableStatuses = dto.retryFailed
			? [AssetImportItemStatus.PENDING, AssetImportItemStatus.FAILED]
			: [AssetImportItemStatus.PENDING];
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
					status: In(selectableStatuses),
				},
				order: { rowNumber: 'ASC' },
			});
		}

		return this.itemRepo.find({
			where: {
				batchId,
				status: In(selectableStatuses),
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

	/**
	 * Gắn file Excel đã scan (key + URL tải) vào list và detail.
	 * Batch cũ chỉ giữ key trong params của scan job, nên đọc một lần rồi lưu lại.
	 */
	async attachScannedFiles<
		T extends {
			id: string;
			fileName: string;
			fileKey?: string | null;
			scanJobId?: string | null;
		},
	>(
		batches: T[],
	): Promise<
		Array<T & { fileKey: string | null; downloadUrl: string | null }>
	> {
		const missingJobIds = batches
			.filter((batch) => !batch.fileKey && batch.scanJobId)
			.map((batch) => batch.scanJobId as string);
		const keyByJobId = new Map<string, string>();
		if (missingJobIds.length) {
			try {
				const jobs =
					await this.importJobsService.findByIds(missingJobIds);
				for (const job of jobs) {
					const key = job.params?.r2Key;
					if (typeof key === 'string' && this.isAssetImportKey(key)) {
						keyByJobId.set(job.id, key);
					}
				}
			} catch (error) {
				this.logger.warn(
					`Không đọc được file key của scan job: ${this.errorText(error)}`,
				);
			}
		}

		return Promise.all(
			batches.map(async (batch) => {
				const resolved =
					(batch.fileKey && this.isAssetImportKey(batch.fileKey)
						? batch.fileKey
						: null) ||
					(batch.scanJobId
						? (keyByJobId.get(batch.scanJobId) ?? null)
						: null);
				if (resolved && resolved !== batch.fileKey) {
					await this.batchRepo.update(batch.id, {
						fileKey: resolved,
					});
				}
				const downloadUrl = resolved
					? await this.signScannedFile(resolved, batch.fileName)
					: null;
				return { ...batch, fileKey: resolved, downloadUrl };
			}),
		);
	}

	private isAssetImportKey(key: string): boolean {
		return key.startsWith(ASSET_IMPORT_R2_PREFIX) && !key.includes('..');
	}

	private async signScannedFile(
		key: string,
		fileName: string,
	): Promise<string | null> {
		const safeName =
			fileName.replace(/["\r\n]/g, '').trim() || 'asset-import.xlsx';
		try {
			return await this.r2Service.getSignedUrlDown({
				key,
				isPublic: false,
				fileName: safeName,
			});
		} catch (error) {
			this.logger.warn(
				`Không ký được URL tải ${key}: ${this.errorText(error)}`,
			);
			return null;
		}
	}

	/**
	 * @param withTargetTenant load kèm workspace đích để trả thẳng cho FE.
	 * Các luồng nội bộ (apply, cancel) không cần nên mặc định tắt.
	 */
	async getBatchOrFail(
		batchId: string,
		withTargetTenant = false,
	): Promise<AssetImportBatch> {
		const batch = await this.batchRepo.findOne({
			where: { id: batchId },
			...(withTargetTenant ? { relations: { targetTenant: true } } : {}),
		});
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
		this.logger.error(
			`Batch ${batchId} thất bại: ${err.message}`,
			err.stack,
		);
		await this.batchRepo.update(batchId, {
			status: AssetImportBatchStatus.FAILED,
			errorMessage: err.message,
		});
		await this.importJobsService.markFailed(jobId, err);
	}
}
