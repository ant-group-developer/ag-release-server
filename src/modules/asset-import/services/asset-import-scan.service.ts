import { Injectable, Logger } from '@nestjs/common';
import { Label } from 'src/modules/label/entities/label.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Tenant } from 'src/modules/tenant/tenant.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { buildEquivalentUpcs } from 'src/utils/upc.util';
import { DataSource, In } from 'typeorm';
import { ASSET_IMPORT_FIELD_LABELS } from '../constants/asset-import.constant';
import {
	AssetImportAction,
	AssetImportChangeType,
	AssetImportMatchType,
} from '../enum/asset-import.enum';
import {
	AssetImportChange,
	AssetImportOptions,
	AssetImportScanSummary,
	ParsedAssetRow,
	ScannedAssetRow,
} from '../interfaces/asset-import.interface';

interface ScanContext {
	targetTenantId: string;
	targetLabelId: string | null;
	options: AssetImportOptions;
}

/** Bản ghi hệ thống đã khớp, kèm dữ liệu hiển thị đã resolve sẵn. */
interface MatchedRecord {
	release: Release;
	track: Track | null;
	matchType: AssetImportMatchType;
}

@Injectable()
export class AssetImportScanService {
	private readonly logger = new Logger(AssetImportScanService.name);

	constructor(private readonly dataSource: DataSource) {}

	/**
	 * Đối chiếu toàn bộ dòng file với dữ liệu hệ thống và sinh diff từng cột.
	 *
	 * Mọi truy vấn đều gom theo lô (ISRC một lần, UPC một lần) rồi tra trong
	 * Map — file vài nghìn dòng vẫn chỉ tốn số truy vấn cố định.
	 */
	async scan(
		rows: ParsedAssetRow[],
		context: ScanContext,
	): Promise<{ items: ScannedAssetRow[]; summary: AssetImportScanSummary }> {
		const { trackByIsrc, releaseById, releaseByUpc, conflictIsrcs } =
			await this.loadMatches(rows);

		const labelResolution = await this.resolveLabels(rows, context);
		const displayNames = await this.loadDisplayNames(
			releaseById,
			context.targetTenantId,
		);

		const items: ScannedAssetRow[] = rows.map((row) =>
			this.scanRow(row, context, {
				trackByIsrc,
				releaseById,
				releaseByUpc,
				conflictIsrcs,
				labelResolution,
				displayNames,
			}),
		);

		return { items, summary: this.summarize(items) };
	}

	// ── Truy vấn gom lô ───────────────────────────────────────────────

	private async loadMatches(rows: ParsedAssetRow[]) {
		const isrcs = [
			...new Set(rows.map((r) => r.isrc).filter((v): v is string => !!v)),
		];
		const upcs = [
			...new Set(rows.map((r) => r.upc).filter((v): v is string => !!v)),
		];

		const trackRepo = this.dataSource.getRepository(Track);
		const releaseRepo = this.dataSource.getRepository(Release);

		const tracks = isrcs.length
			? await trackRepo.find({
					where: { isrc: In(isrcs) },
					order: { createdAt: 'ASC' },
				})
			: [];

		// ISRC trỏ tới nhiều release khác nhau là dữ liệu mập mờ — đánh dấu
		// CONFLICT để người dùng tự xử lý thay vì đoán.
		const releaseIdsByIsrc = new Map<string, Set<string>>();
		const trackByIsrc = new Map<string, Track>();
		for (const track of tracks) {
			if (!track.isrc) continue;
			if (!trackByIsrc.has(track.isrc)) trackByIsrc.set(track.isrc, track);
			const set = releaseIdsByIsrc.get(track.isrc) ?? new Set<string>();
			set.add(track.releaseId);
			releaseIdsByIsrc.set(track.isrc, set);
		}
		const conflictIsrcs = new Set(
			[...releaseIdsByIsrc.entries()]
				.filter(([, ids]) => ids.size > 1)
				.map(([isrc]) => isrc),
		);

		// UPC trong hệ thống có thể được lưu với số 0 đứng đầu khác nhau,
		// nên tra theo mọi biến thể tương đương.
		const upcVariants = [...new Set(upcs.flatMap(buildEquivalentUpcs))];
		const releasesByUpcQuery = upcVariants.length
			? await releaseRepo.find({
					where: { upc: In(upcVariants) },
					order: { createdAt: 'ASC' },
				})
			: [];

		const releaseByUpc = new Map<string, Release>();
		for (const release of releasesByUpcQuery) {
			if (!release.upc) continue;
			for (const variant of buildEquivalentUpcs(release.upc)) {
				if (!releaseByUpc.has(variant)) {
					releaseByUpc.set(variant, release);
				}
			}
		}

		// Release của các track khớp theo ISRC.
		const trackReleaseIds = [...new Set(tracks.map((t) => t.releaseId))];
		const trackReleases = trackReleaseIds.length
			? await releaseRepo.find({ where: { id: In(trackReleaseIds) } })
			: [];

		const releaseById = new Map<string, Release>();
		for (const release of [...trackReleases, ...releasesByUpcQuery]) {
			releaseById.set(release.id, release);
		}

		return { trackByIsrc, releaseById, releaseByUpc, conflictIsrcs };
	}

	/**
	 * Resolve label đích cho mỗi tên label xuất hiện trong file.
	 * Trả về Map tên(lowercase) → label, cộng thêm label cố định của cả batch.
	 */
	private async resolveLabels(rows: ParsedAssetRow[], context: ScanContext) {
		const labelRepo = this.dataSource.getRepository(Label);

		const fixedLabel = context.targetLabelId
			? await labelRepo.findOne({
					where: {
						id: context.targetLabelId,
						tenantId: context.targetTenantId,
					},
				})
			: null;

		const names = [
			...new Set(
				rows
					.map((r) => r.labelName?.trim().toLowerCase())
					.filter((v): v is string => !!v),
			),
		];

		const byName = new Map<string, Label>();
		if (names.length) {
			// Lọc trong bộ nhớ theo tên lowercase thay vì n lần ILike.
			const labels = await labelRepo.find({
				where: { tenantId: context.targetTenantId },
			});
			for (const label of labels) {
				const key = label.name?.trim().toLowerCase();
				if (key && names.includes(key) && !byName.has(key)) {
					byName.set(key, label);
				}
			}
		}

		return { fixedLabel, byName };
	}

	/** Tên tenant/label hiện tại để hiển thị trong diff. */
	private async loadDisplayNames(
		releaseById: Map<string, Release>,
		targetTenantId: string,
	) {
		const releases = [...releaseById.values()];
		const tenantIds = [
			...new Set([
				targetTenantId,
				...releases.map((r) => r.tenantId).filter(Boolean),
			]),
		];
		const labelIds = [
			...new Set(releases.map((r) => r.labelId).filter((v): v is string => !!v)),
		];

		const [tenants, labels] = await Promise.all([
			tenantIds.length
				? this.dataSource
						.getRepository(Tenant)
						.find({ where: { id: In(tenantIds) } })
				: Promise.resolve([]),
			labelIds.length
				? this.dataSource
						.getRepository(Label)
						.find({ where: { id: In(labelIds) } })
				: Promise.resolve([]),
		]);

		return {
			tenantNames: new Map(tenants.map((t) => [t.id, t.name ?? t.title ?? ''])),
			labelNames: new Map(labels.map((l) => [l.id, l.name])),
		};
	}

	// ── Đối chiếu từng dòng ───────────────────────────────────────────

	private scanRow(
		row: ParsedAssetRow,
		context: ScanContext,
		lookups: {
			trackByIsrc: Map<string, Track>;
			releaseById: Map<string, Release>;
			releaseByUpc: Map<string, Release>;
			conflictIsrcs: Set<string>;
			labelResolution: { fixedLabel: Label | null; byName: Map<string, Label> };
			displayNames: {
				tenantNames: Map<string, string>;
				labelNames: Map<string, string>;
			};
		},
	): ScannedAssetRow {
		const base: ScannedAssetRow = {
			...row,
			matchType: AssetImportMatchType.NONE,
			action: AssetImportAction.NO_CHANGE,
			matchedReleaseId: null,
			matchedTrackId: null,
			currentTenantId: null,
			currentLabelId: null,
			changes: [],
			errorMessage: null,
		};

		if (!row.isrc && !row.upc) {
			return {
				...base,
				action: AssetImportAction.INVALID,
				errorMessage: 'Dòng thiếu cả ISRC lẫn UPC nên không đối chiếu được',
			};
		}

		if (row.isrc && lookups.conflictIsrcs.has(row.isrc)) {
			return {
				...base,
				action: AssetImportAction.CONFLICT,
				errorMessage: `ISRC ${row.isrc} đang thuộc nhiều release khác nhau, cần xử lý thủ công`,
			};
		}

		const matched = this.findMatch(row, lookups);

		if (!matched) {
			if (!context.options.createIfNotFound) {
				return {
					...base,
					action: AssetImportAction.NO_CHANGE,
					errorMessage: 'Không tìm thấy trong hệ thống và option tạo mới đang tắt',
				};
			}
			return {
				...base,
				action: AssetImportAction.CREATE,
				changes: this.buildCreateChanges(row, context, lookups),
			};
		}

		const { release, track, matchType } = matched;
		const changes = this.buildUpdateChanges(
			row,
			release,
			track,
			context,
			lookups,
		);

		return {
			...base,
			matchType,
			action: changes.length
				? AssetImportAction.UPDATE
				: AssetImportAction.NO_CHANGE,
			matchedReleaseId: release.id,
			matchedTrackId: track?.id ?? null,
			currentTenantId: release.tenantId,
			currentLabelId: release.labelId,
			changes,
		};
	}

	/** ISRC trước (track-level, chính xác nhất), không có thì fallback UPC. */
	private findMatch(
		row: ParsedAssetRow,
		lookups: {
			trackByIsrc: Map<string, Track>;
			releaseById: Map<string, Release>;
			releaseByUpc: Map<string, Release>;
		},
	): MatchedRecord | null {
		if (row.isrc) {
			const track = lookups.trackByIsrc.get(row.isrc);
			const release = track && lookups.releaseById.get(track.releaseId);
			if (track && release) {
				return { release, track, matchType: AssetImportMatchType.ISRC };
			}
		}

		if (row.upc) {
			for (const variant of buildEquivalentUpcs(row.upc)) {
				const release = lookups.releaseByUpc.get(variant);
				if (release) {
					return {
						release,
						track: null,
						matchType: AssetImportMatchType.UPC,
					};
				}
			}
		}

		return null;
	}

	// ── Sinh diff ─────────────────────────────────────────────────────

	private buildUpdateChanges(
		row: ParsedAssetRow,
		release: Release,
		track: Track | null,
		context: ScanContext,
		lookups: {
			labelResolution: { fixedLabel: Label | null; byName: Map<string, Label> };
			displayNames: {
				tenantNames: Map<string, string>;
				labelNames: Map<string, string>;
			};
		},
	): AssetImportChange[] {
		const changes: AssetImportChange[] = [];
		const { options } = context;
		const { tenantNames } = lookups.displayNames;

		if (options.updateOwnership) {
			if (release.tenantId !== context.targetTenantId) {
				changes.push({
					field: 'tenantId',
					label: ASSET_IMPORT_FIELD_LABELS.tenantId,
					oldValue: release.tenantId,
					oldDisplay: tenantNames.get(release.tenantId) ?? null,
					newValue: context.targetTenantId,
					newDisplay: tenantNames.get(context.targetTenantId) ?? null,
					changeType: AssetImportChangeType.OVERWRITE,
				});
			}

			const labelChange = this.buildLabelChange(row, release, context, lookups);
			if (labelChange) changes.push(labelChange);
		}

		if (options.overwriteMetadata || options.fillEmptyOnly) {
			this.pushTextChange(
				changes,
				'title',
				ASSET_IMPORT_FIELD_LABELS.title,
				track?.title ?? null,
				row.trackName,
				options,
				// Chỉ đổi title track khi thực sự khớp tới track cụ thể.
				track !== null,
			);
			this.pushTextChange(
				changes,
				'albumTitle',
				ASSET_IMPORT_FIELD_LABELS.albumTitle,
				release.title ?? null,
				row.albumName,
				options,
			);
			this.pushTextChange(
				changes,
				'upc',
				ASSET_IMPORT_FIELD_LABELS.upc,
				release.upc ?? null,
				row.upc,
				options,
			);
		}

		return changes;
	}

	private buildLabelChange(
		row: ParsedAssetRow,
		release: Release,
		context: ScanContext,
		lookups: {
			labelResolution: { fixedLabel: Label | null; byName: Map<string, Label> };
			displayNames: {
				tenantNames: Map<string, string>;
				labelNames: Map<string, string>;
			};
		},
	): AssetImportChange | null {
		const { fixedLabel, byName } = lookups.labelResolution;
		const { labelNames } = lookups.displayNames;
		const oldDisplay = release.labelId
			? (labelNames.get(release.labelId) ?? null)
			: null;

		const target =
			fixedLabel ?? byName.get(row.labelName?.trim().toLowerCase() ?? '');

		if (target) {
			if (release.labelId === target.id) return null;
			return {
				field: 'labelId',
				label: ASSET_IMPORT_FIELD_LABELS.labelId,
				oldValue: release.labelId,
				oldDisplay,
				newValue: target.id,
				newDisplay: target.name,
				changeType: AssetImportChangeType.OVERWRITE,
			};
		}

		// Chưa có label khớp trong tenant đích — chỉ báo tạo mới khi được bật.
		if (row.labelName && context.options.createLabelIfMissing) {
			return {
				field: 'labelId',
				label: ASSET_IMPORT_FIELD_LABELS.labelId,
				oldValue: release.labelId,
				oldDisplay,
				newValue: null,
				newDisplay: row.labelName,
				changeType: AssetImportChangeType.CREATE,
			};
		}

		return null;
	}

	private buildCreateChanges(
		row: ParsedAssetRow,
		context: ScanContext,
		lookups: {
			labelResolution: { fixedLabel: Label | null; byName: Map<string, Label> };
			displayNames: {
				tenantNames: Map<string, string>;
				labelNames: Map<string, string>;
			};
		},
	): AssetImportChange[] {
		const { fixedLabel, byName } = lookups.labelResolution;
		const target =
			fixedLabel ?? byName.get(row.labelName?.trim().toLowerCase() ?? '');

		return [
			{
				field: 'tenantId',
				label: ASSET_IMPORT_FIELD_LABELS.tenantId,
				oldValue: null,
				oldDisplay: null,
				newValue: context.targetTenantId,
				newDisplay:
					lookups.displayNames.tenantNames.get(context.targetTenantId) ?? null,
				changeType: AssetImportChangeType.CREATE,
			},
			{
				field: 'labelId',
				label: ASSET_IMPORT_FIELD_LABELS.labelId,
				oldValue: null,
				oldDisplay: null,
				newValue: target?.id ?? null,
				newDisplay: target?.name ?? row.labelName ?? null,
				changeType: AssetImportChangeType.CREATE,
			},
			{
				field: 'title',
				label: ASSET_IMPORT_FIELD_LABELS.title,
				oldValue: null,
				oldDisplay: null,
				newValue: row.trackName ?? row.albumName ?? null,
				newDisplay: null,
				changeType: AssetImportChangeType.CREATE,
			},
		];
	}

	/**
	 * Thêm diff cho một field text.
	 *
	 * fillEmptyOnly có quyền phủ quyết overwriteMetadata: khi bật, field đã có
	 * giá trị sẽ không sinh diff. Đây là chế độ an toàn người dùng chọn chủ ý.
	 */
	private pushTextChange(
		changes: AssetImportChange[],
		field: string,
		label: string,
		currentValue: string | null,
		newValue: string | null,
		options: AssetImportOptions,
		enabled = true,
	): void {
		if (!enabled || !newValue) return;

		const current = currentValue?.trim() || null;
		if (current === newValue) return;

		if (current) {
			if (options.fillEmptyOnly || !options.overwriteMetadata) return;
			changes.push({
				field,
				label,
				oldValue: current,
				newValue,
				changeType: AssetImportChangeType.OVERWRITE,
			});
			return;
		}

		changes.push({
			field,
			label,
			oldValue: null,
			newValue,
			changeType: AssetImportChangeType.FILL_EMPTY,
		});
	}

	private summarize(items: ScannedAssetRow[]): AssetImportScanSummary {
		const count = (action: AssetImportAction) =>
			items.filter((i) => i.action === action).length;

		return {
			totalRows: items.length,
			matched: items.filter((i) => i.matchedReleaseId !== null).length,
			new: count(AssetImportAction.CREATE),
			invalid: count(AssetImportAction.INVALID),
			conflict: count(AssetImportAction.CONFLICT),
			willUpdate: count(AssetImportAction.UPDATE),
			noChange: count(AssetImportAction.NO_CHANGE),
		};
	}
}
