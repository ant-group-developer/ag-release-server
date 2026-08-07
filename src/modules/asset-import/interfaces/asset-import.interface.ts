import {
	AssetImportAction,
	AssetImportChangeType,
	AssetImportMatchType,
} from '../enum/asset-import.enum';

/** Option người dùng chọn khi scan — snapshot lại vào batch. */
export interface AssetImportOptions {
	/** Đổi tenant (workspace) + label của bản ghi khớp */
	updateOwnership: boolean;
	/** Đè track title / album title / UPC bằng giá trị trong file */
	overwriteMetadata: boolean;
	/** ISRC/UPC chưa có trong hệ thống → tạo Release + Track mới */
	createIfNotFound: boolean;
	/** Chỉ điền vào ô đang null/rỗng, không đè giá trị đã có */
	fillEmptyOnly: boolean;
	/** Label trong file chưa tồn tại ở tenant đích → tạo mới */
	createLabelIfMissing: boolean;
}

/** Một thay đổi ở cấp field — phần tử của cột `changes` (jsonb). */
export interface AssetImportChange {
	field: string;
	label: string;
	oldValue: string | null;
	newValue: string | null;
	/** Tên hiển thị của oldValue khi giá trị là ID (tenant, label) */
	oldDisplay?: string | null;
	/** Tên hiển thị của newValue khi giá trị là ID */
	newDisplay?: string | null;
	changeType: AssetImportChangeType;
	/** Giải thích vì sao có thay đổi này, dùng cho AUTO_SELECT. FE hiện làm tooltip. */
	note?: string | null;
}

/** Một dòng file sau khi parse + normalize, trước khi match. */
export interface ParsedAssetRow {
	rowNumber: number;
	raw: Record<string, unknown>;
	isrc: string | null;
	upc: string | null;
	trackName: string | null;
	albumName: string | null;
	labelName: string | null;
}

/** Kết quả đối chiếu 1 dòng — dựng thành asset_import_items. */
export interface ScannedAssetRow extends ParsedAssetRow {
	matchType: AssetImportMatchType;
	action: AssetImportAction;
	matchedReleaseId: string | null;
	matchedTrackId: string | null;
	currentTenantId: string | null;
	currentLabelId: string | null;
	changes: AssetImportChange[];
	errorMessage: string | null;
}

export interface AssetImportScanSummary {
	totalRows: number;
	matched: number;
	new: number;
	invalid: number;
	conflict: number;
	willUpdate: number;
	noChange: number;
}

export interface AssetImportApplySummary {
	appliedRows: number;
	failedRows: number;
	skippedRows: number;
}

/** Ownership hiện tại của bản ghi khớp, dùng để dựng diff và hiển thị. */
export interface CurrentOwnership {
	releaseId: string;
	trackId: string | null;
	tenantId: string;
	tenantName: string | null;
	labelId: string | null;
	labelName: string | null;
	trackTitle: string | null;
	albumTitle: string | null;
	upc: string | null;
}
