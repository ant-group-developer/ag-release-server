/**
 * Alias header Excel → field chuẩn. So khớp sau khi normalize:
 * lowercase, bỏ dấu cách/gạch dưới/gạch ngang.
 *
 * Cột không nằm trong map vẫn được giữ nguyên vào `raw_data` để không mất dữ liệu.
 */
export const ASSET_IMPORT_COLUMN_ALIASES: Record<string, string[]> = {
	isrc: ['isrc', 'isrccode', 'mãisrc'],
	trackName: [
		'nametrack',
		'trackname',
		'tracktitle',
		'title',
		'songname',
		'têntrack',
		'tênbàihát',
	],
	albumName: [
		'namealbum',
		'albumname',
		'albumtitle',
		'releasetitle',
		'projecttitle',
		'tênalbum',
	],
	upc: ['upc', 'gpid', 'barcode', 'ean', 'upccode'],
	labelName: [
		'label',
		'labelname',
		'lable',
		'lablename',
		'marketingowner',
		'marketingownername',
		'tênlabel',
	],
};

/** Chuẩn hoá header để so với alias: bỏ dấu cách, gạch dưới, gạch ngang. */
export function normalizeHeader(header: string): string {
	return header
		.toLowerCase()
		.replace(/[\s_\-.]/g, '')
		.trim();
}

/**
 * Dựng map từ header thật trong file → field chuẩn.
 * Header đầu tiên khớp một alias sẽ chiếm field đó; header sau bị bỏ qua
 * để tránh cột trùng ghi đè lẫn nhau.
 */
export function buildHeaderMap(headers: string[]): Map<string, string> {
	const map = new Map<string, string>();
	const claimed = new Set<string>();

	for (const header of headers) {
		const normalized = normalizeHeader(header);
		for (const [field, aliases] of Object.entries(
			ASSET_IMPORT_COLUMN_ALIASES,
		)) {
			if (claimed.has(field)) continue;
			if (aliases.includes(normalized)) {
				map.set(header, field);
				claimed.add(field);
				break;
			}
		}
	}

	return map;
}

/** Số dòng tối đa còn chạy scan đồng bộ; vượt ngưỡng thì chạy nền. */
export const ASSET_IMPORT_SCAN_SYNC_THRESHOLD = 1000;

/** Số item insert mỗi lần ghi xuống Postgres. */
export const ASSET_IMPORT_ITEM_CHUNK_SIZE = 500;

/** Nguồn ghi vào ClickHouse metadata_enrichment_log. */
export const ASSET_IMPORT_ENRICHMENT_SOURCE = 'asset_import';

/** Đánh dấu nguồn import trên Release/Track được tạo bởi luồng này. */
export const ASSET_IMPORT_SOURCE_TYPE = 'ASSET_IMPORT';
export const ASSET_IMPORT_PARSER_CODE = 'asset-import';

export const ASSET_IMPORT_ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.csv'];

/**
 * Thư mục trên R2 chứa file upload của luồng này. Scan chỉ chấp nhận key nằm
 * trong prefix này để không đọc được object tuỳ ý trong bucket.
 */
export const ASSET_IMPORT_R2_PREFIX = 'asset-import/';

/** Template Excel chuẩn, lưu cố định trong protected R2 bucket. */
export const ASSET_IMPORT_TEMPLATE_FILE_NAME = 'asset-import-template.xlsx';
export const ASSET_IMPORT_TEMPLATE_R2_KEY = `${ASSET_IMPORT_R2_PREFIX}templates/${ASSET_IMPORT_TEMPLATE_FILE_NAME}`;

/** Hạn dùng của presigned upload URL (giây) — khớp mặc định của BucketR2Service. */
export const ASSET_IMPORT_PRESIGN_EXPIRES_IN = 60 * 60;

/** Nhãn hiển thị cho từng field trong diff. */
export const ASSET_IMPORT_FIELD_LABELS: Record<string, string> = {
	tenantId: 'Workspace',
	labelId: 'Label',
	title: 'Track name',
	albumTitle: 'Album name',
	upc: 'UPC',
};
