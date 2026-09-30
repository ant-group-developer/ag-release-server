import { Injectable, Logger } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { CLICKHOUSE_TABLES } from 'src/modules/clickhouse/clickhouse.constants';
import { ClickHouseService } from 'src/modules/clickhouse/clickhouse.service';
import { Label } from 'src/modules/label/entities/label.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { ReleaseReportImportService } from 'src/modules/release/services/release-report-import.service';
import { Track } from 'src/modules/track/entities/track.entity';
import { stringToCode } from 'src/utils/util';
import { DataSource, EntityManager } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
	ASSET_IMPORT_ENRICHMENT_SOURCE,
	ASSET_IMPORT_PARSER_CODE,
	ASSET_IMPORT_SOURCE_TYPE,
} from '../constants/asset-import.constant';
import { AssetImportBatch } from '../entities/asset-import-batch.entity';
import { AssetImportItem } from '../entities/asset-import-item.entity';
import {
	AssetImportAction,
	AssetImportChangeType,
	AssetImportItemStatus,
} from '../enum/asset-import.enum';
import { AssetImportChange } from '../interfaces/asset-import.interface';
import { AssetOwnershipService } from './asset-ownership.service';

/** Một dòng audit ghi vào ClickHouse metadata_enrichment_log. */
interface EnrichmentLogRow extends Record<string, unknown> {
	id: string;
	scan_id: string;
	entity_type: string;
	entity_id: string;
	release_id: string;
	isrc: string;
	upc: string;
	field_name: string;
	old_value: string;
	new_value: string;
	change_type: string;
	enrichment_source: string;
	api_track_id: string;
	api_album_id: string;
	api_artist_id: string;
	status: string;
	error_message: string;
	is_dry_run: number;
	created_at: string;
	created_by: string;
}

@Injectable()
export class AssetImportApplyService {
	private readonly logger = new Logger(AssetImportApplyService.name);

	constructor(
		private readonly dataSource: DataSource,
		private readonly releaseReportImportService: ReleaseReportImportService,
		private readonly clickHouseService: ClickHouseService,
		private readonly assetOwnershipService: AssetOwnershipService,
	) {}

	/**
	 * Apply một item. Mỗi item chạy trong transaction riêng nên một item hỏng
	 * không kéo đổ cả lô — lỗi được ghi vào chính item đó và vòng lặp chạy tiếp.
	 */
	async applyItem(
		item: AssetImportItem,
		batch: AssetImportBatch,
		userId: string,
	): Promise<{ status: AssetImportItemStatus; errorMessage: string | null }> {
		if (
			item.action === AssetImportAction.INVALID ||
			item.action === AssetImportAction.CONFLICT ||
			item.action === AssetImportAction.MERGE_REQUIRED ||
			item.action === AssetImportAction.NO_CHANGE
		) {
			return {
				status: AssetImportItemStatus.SKIPPED,
				errorMessage: null,
			};
		}

		try {
			// CREATE chạy ngoài transaction của service này: importRelease() tự mở
			// transaction riêng, lồng hai transaction trên hai connection khác nhau
			// sẽ khoá nhau. Bản thân importRelease đã atomic và idempotent theo UPC/ISRC.
			const logs =
				item.action === AssetImportAction.CREATE
					? await this.applyCreate(item, batch, userId)
					: await this.dataSource.transaction((manager) =>
							this.applyUpdate(manager, item, batch, userId),
						);

			// Audit ghi ngoài transaction: ClickHouse không tham gia transaction
			// Postgres, và lỗi ghi log không được phép làm hỏng thay đổi đã commit.
			await this.writeAuditLogs(logs);

			return {
				status: AssetImportItemStatus.APPLIED,
				errorMessage: null,
			};
		} catch (err: any) {
			this.logger.warn(
				`Apply item ${item.id} (row ${item.rowNumber}) failed: ${err.message}`,
			);
			return {
				status: AssetImportItemStatus.FAILED,
				errorMessage: err.message ?? 'Unknown error',
			};
		}
	}

	// ── UPDATE ────────────────────────────────────────────────────────

	private async applyUpdate(
		manager: EntityManager,
		item: AssetImportItem,
		batch: AssetImportBatch,
		userId: string,
	): Promise<EnrichmentLogRow[]> {
		await this.remapMergedReferences(manager, item);
		if (!item.matchedReleaseId) {
			throw new Error('Item không có release khớp để cập nhật');
		}

		const releasePatch: Partial<Release> = {};
		const trackPatch: Partial<Track> = {};
		const appliedChanges: AssetImportChange[] = [];
		let labelCreated: { id: string; name: string } | null = null;

		for (const change of item.changes) {
			switch (change.field) {
				case 'tenantId':
					releasePatch.tenantId = change.newValue!;
					appliedChanges.push(change);
					break;

				case 'labelId': {
					const resolved = await this.resolveLabelId(
						manager,
						change,
						item,
						batch,
						userId,
					);
					if (resolved.labelId) {
						releasePatch.labelId = resolved.labelId;
						appliedChanges.push({
							...change,
							newValue: resolved.labelId,
						});
						if (resolved.created) {
							labelCreated = {
								id: resolved.labelId,
								name: resolved.name!,
							};
						}
					}
					break;
				}

				case 'albumTitle':
					releasePatch.title = change.newValue!;
					appliedChanges.push(change);
					break;

				case 'upc':
					releasePatch.upc = change.newValue!;
					appliedChanges.push(change);
					break;

				case 'title':
					if (item.matchedTrackId) {
						trackPatch.title = change.newValue!;
						appliedChanges.push(change);
					}
					break;
			}
		}

		const ownershipChanged =
			Object.prototype.hasOwnProperty.call(releasePatch, 'tenantId') ||
			Object.prototype.hasOwnProperty.call(releasePatch, 'labelId');
		const ownershipTenantId = releasePatch.tenantId;
		const ownershipLabelId = releasePatch.labelId;
		delete releasePatch.tenantId;
		delete releasePatch.labelId;

		if (ownershipChanged) {
			const release = await manager.findOneOrFail(Release, {
				where: { id: item.matchedReleaseId },
			});
			await this.assetOwnershipService.transfer(manager, {
				releaseId: release.id,
				tenantId: ownershipTenantId ?? release.tenantId,
				labelId: ownershipLabelId ?? release.labelId ?? null,
				effectiveDate: batch.effectiveDate,
				revenueEffectiveFrom: batch.revenueEffectiveFrom,
				assetImportItemId: item.id,
				actorId: userId,
			});
		}

		if (Object.keys(releasePatch).length) {
			releasePatch.modifierId = userId;
			await manager.update(Release, item.matchedReleaseId, releasePatch);
		}

		if (Object.keys(trackPatch).length && item.matchedTrackId) {
			await manager.update(Track, item.matchedTrackId, trackPatch);
		}

		// Track thuộc release nên đổi workspace ở release là đủ; track không có
		// cột tenant riêng. Nhưng khi khớp bằng ISRC mà track nằm ở release khác
		// thì đã bị chặn từ bước scan (CONFLICT).
		const logs = appliedChanges.map((change) =>
			this.buildLogRow(
				change,
				item,
				batch,
				userId,
				item.matchedReleaseId!,
			),
		);

		if (labelCreated) {
			logs.push(
				this.buildLabelCreatedLogRow(
					labelCreated,
					item,
					batch,
					userId,
					item.matchedReleaseId,
				),
			);
		}

		return logs;
	}

	/**
	 * Asset batches keep the release/track IDs found during scan. A later
	 * release-merge can delete the imported release and leave an alias pointing
	 * at the canonical release. Follow that alias chain before applying so an
	 * older batch can still be retried safely.
	 */
	private async remapMergedReferences(
		manager: EntityManager,
		item: AssetImportItem,
	): Promise<void> {
		// Keep the apply service usable with lightweight unit-test managers and
		// older adapters that do not expose raw-query execution. The real
		// TypeORM EntityManager always has `query`, so production still follows
		// merge aliases.
		if (
			typeof (manager as EntityManager & { query?: unknown }).query !==
			'function'
		) {
			return;
		}
		const releaseId = item.matchedReleaseId
			? await this.resolveAliasChain(
					manager,
					'release_merge_aliases',
					'source_release_id',
					item.matchedReleaseId,
				)
			: null;
		const trackId = item.matchedTrackId
			? await this.resolveAliasChain(
					manager,
					'track_merge_aliases',
					'source_track_id',
					item.matchedTrackId,
				)
			: null;

		const patch: {
			matchedReleaseId?: string;
			matchedTrackId?: string;
		} = {};
		if (releaseId && releaseId !== item.matchedReleaseId) {
			item.matchedReleaseId = releaseId;
			patch.matchedReleaseId = releaseId;
		}
		if (trackId && trackId !== item.matchedTrackId) {
			item.matchedTrackId = trackId;
			patch.matchedTrackId = trackId;
		}
		if (Object.keys(patch).length) {
			await manager.update(AssetImportItem, item.id, patch);
			this.logger.log(
				`Remapped merged asset item ${item.id}: release=${item.matchedReleaseId}, track=${item.matchedTrackId ?? 'none'}`,
			);
		}
	}

	private async resolveAliasChain(
		manager: EntityManager,
		table: 'release_merge_aliases' | 'track_merge_aliases',
		sourceColumn: 'source_release_id' | 'source_track_id',
		id: string,
	): Promise<string> {
		const targetColumn =
			sourceColumn === 'source_release_id'
				? 'target_release_id'
				: 'target_track_id';
		const rows: Array<{ target_id: string }> = await manager.query(
			`WITH RECURSIVE alias_chain AS (
			   SELECT ${sourceColumn} AS source_id,
			          ${targetColumn} AS target_id,
			          1 AS depth
			   FROM ${table}
			   WHERE ${sourceColumn} = $1
			   UNION ALL
			   SELECT chain.source_id,
			          alias.${targetColumn} AS target_id,
			          chain.depth + 1
			   FROM alias_chain chain
			   JOIN ${table} alias
			     ON alias.${sourceColumn} = chain.target_id
			   WHERE chain.depth < 20
			 )
			 SELECT target_id
			 FROM alias_chain
			 ORDER BY depth DESC
			 LIMIT 1`,
			[id],
		);
		return rows[0]?.target_id ?? id;
	}

	// ── CREATE ────────────────────────────────────────────────────────

	private async applyCreate(
		item: AssetImportItem,
		batch: AssetImportBatch,
		userId: string,
	): Promise<EnrichmentLogRow[]> {
		const title = item.trackName ?? item.albumName;
		if (!title) {
			throw new Error('Không có tên track/album để tạo bản ghi mới');
		}

		const upc = item.upc || (item.isrc ? `ISRC-${item.isrc}` : '');
		if (!upc) {
			throw new Error('Không có UPC lẫn ISRC để tạo release');
		}

		// Label đã được scan quyết sẵn: có id nghĩa là dùng label có sẵn hoặc
		// label auto-select; null nghĩa là sẽ tạo mới theo tên. Chỉ cho phép
		// importRelease tự tạo label khi option bật, nếu không truyền labelId
		// tường minh để resolveOwnership() không sinh label ngoài ý muốn.
		const labelChange = item.changes.find((c) => c.field === 'labelId');
		const allowCreateLabel = batch.options?.createLabelIfMissing === true;
		const resolvedLabelId = labelChange?.newValue ?? null;

		// Truyền tenantId tường minh nên importRelease không rơi vào fallback
		// ANT MUSIC LLC / AMG — đây chính là gốc của dữ liệu sai workspace.
		const release = await this.releaseReportImportService.importRelease({
			upc,
			title: item.albumName ?? title,
			tenantId: batch.targetTenantId,
			labelId: resolvedLabelId ?? undefined,
			labelName:
				!resolvedLabelId && allowCreateLabel
					? (labelChange?.newDisplay ?? item.labelName ?? undefined)
					: undefined,
			tracks: item.isrc ? [{ title, isrc: item.isrc }] : [],
			importSourceType: ASSET_IMPORT_SOURCE_TYPE,
			importParserCode: ASSET_IMPORT_PARSER_CODE,
			importFileName: batch.fileName,
			importJobId: batch.applyJobId ?? batch.id,
		});

		await this.dataSource.transaction((manager) =>
			this.assetOwnershipService.recordInitialOwnership(manager, {
				releaseId: release.id,
				tenantId: release.tenantId,
				labelId: release.labelId ?? null,
				effectiveDate: batch.effectiveDate,
				revenueEffectiveFrom: batch.revenueEffectiveFrom,
				assetImportItemId: item.id,
				actorId: userId,
			}),
		);

		// Lúc scan chưa biết id của label sẽ tạo, nên log sẽ ghi rỗng nếu không
		// đọc lại từ release vừa tạo.
		const logs = item.changes.map((change) =>
			this.buildLogRow(
				change.field === 'labelId' && !change.newValue
					? { ...change, newValue: release.labelId }
					: change,
				item,
				batch,
				userId,
				release.id,
			),
		);

		// Label được importRelease tạo ra khi scan để newValue null mà release
		// trả về vẫn có labelId.
		if (labelChange && !labelChange.newValue && release.labelId) {
			logs.push(
				this.buildLabelCreatedLogRow(
					{
						id: release.labelId,
						name: labelChange.newDisplay ?? item.labelName ?? '',
					},
					item,
					batch,
					userId,
					release.id,
				),
			);
		}

		return logs;
	}

	// ── Label ─────────────────────────────────────────────────────────

	/**
	 * Trả về label id để gán, kèm cờ `created` để biết có cần ghi dòng audit
	 * riêng cho label mới hay không. Diff kiểu `create` nghĩa là label chưa tồn
	 * tại ở workspace đích — tạo mới với code duy nhất trong tenant đó.
	 */
	private async resolveLabelId(
		manager: EntityManager,
		change: AssetImportChange,
		item: AssetImportItem,
		batch: AssetImportBatch,
		userId: string,
	): Promise<{ labelId: string | null; created: boolean; name?: string }> {
		if (change.newValue) {
			return { labelId: change.newValue, created: false };
		}

		const name = (change.newDisplay ?? item.labelName)?.trim();
		if (!name) return { labelId: null, created: false };

		// Có thể đã được tạo bởi item trước trong cùng batch.
		const existing = await manager
			.createQueryBuilder(Label, 'label')
			.where('LOWER(label.name) = LOWER(:name)', { name })
			.andWhere('label.tenantId = :tenantId', {
				tenantId: batch.targetTenantId,
			})
			.getOne();
		if (existing) return { labelId: existing.id, created: false };

		const baseCode = stringToCode(name) || `ASSET_${nanoid(6)}`;
		let code = baseCode;
		while (
			await manager.exists(Label, {
				where: { code, tenantId: batch.targetTenantId },
			})
		) {
			code = `${baseCode}_${nanoid(6)}`;
		}

		const label = await manager.save(
			Label,
			manager.create(Label, {
				name,
				code,
				tenantId: batch.targetTenantId,
				// Admin chủ ý tạo qua công cụ này, không phải label rác sinh từ report.
				isImportedFromReport: false,
				creatorId: userId,
			}),
		);

		return { labelId: label.id, created: true, name };
	}

	// ── Audit ─────────────────────────────────────────────────────────

	private buildLogRow(
		change: AssetImportChange,
		item: AssetImportItem,
		batch: AssetImportBatch,
		userId: string,
		releaseId: string,
	): EnrichmentLogRow {
		return {
			id: uuidv4(),
			scan_id: batch.id,
			entity_type: change.field === 'title' ? 'track' : 'release',
			entity_id:
				change.field === 'title'
					? (item.matchedTrackId ?? '')
					: releaseId,
			release_id: releaseId,
			isrc: item.isrc ?? '',
			upc: item.upc ?? '',
			field_name: change.field,
			old_value: change.oldValue ?? '',
			new_value: change.newValue ?? '',
			change_type:
				item.action === AssetImportAction.CREATE ? 'create' : 'update',
			enrichment_source: ASSET_IMPORT_ENRICHMENT_SOURCE,
			api_track_id: '',
			api_album_id: '',
			api_artist_id: '',
			status: 'applied',
			error_message: '',
			is_dry_run: 0,
			created_at: new Date().toISOString().slice(0, 23).replace('T', ' '),
			created_by: userId,
		};
	}

	/**
	 * Dòng audit riêng cho một Label vừa được tạo. Nếu chỉ ghi change của field
	 * `labelId` thì đọc log không thể biết label nào là mới sinh ra.
	 */
	private buildLabelCreatedLogRow(
		label: { id: string; name: string },
		item: AssetImportItem,
		batch: AssetImportBatch,
		userId: string,
		releaseId: string,
	): EnrichmentLogRow {
		return {
			...this.buildLogRow(
				{
					field: 'name',
					label: 'Label',
					oldValue: null,
					newValue: label.name,
					changeType: AssetImportChangeType.CREATE,
				},
				item,
				batch,
				userId,
				releaseId,
			),
			id: uuidv4(),
			entity_type: 'label',
			entity_id: label.id,
			change_type: 'create',
		};
	}

	async writeAuditLogs(logs: EnrichmentLogRow[]): Promise<void> {
		if (!logs.length) return;
		try {
			await this.clickHouseService.insert(
				CLICKHOUSE_TABLES.METADATA_ENRICHMENT_LOG,
				logs,
			);
		} catch (err: any) {
			this.logger.error(`Ghi audit log thất bại: ${err.message}`);
		}
	}
}
