/** Trạng thái vòng đời của một batch import assets. */
export enum AssetImportBatchStatus {
	SCANNING = 'SCANNING',
	SCANNED = 'SCANNED',
	APPLYING = 'APPLYING',
	APPLIED = 'APPLIED',
	PARTIALLY_APPLIED = 'PARTIALLY_APPLIED',
	FAILED = 'FAILED',
	CANCELLED = 'CANCELLED',
}

/** Khoá dùng để match dòng file với dữ liệu trong hệ thống. */
export enum AssetImportMatchType {
	ISRC = 'ISRC',
	UPC = 'UPC',
	NONE = 'NONE',
}

/** Hành động sẽ thực hiện với dòng này khi apply. */
export enum AssetImportAction {
	UPDATE = 'UPDATE',
	CREATE = 'CREATE',
	NO_CHANGE = 'NO_CHANGE',
	INVALID = 'INVALID',
	CONFLICT = 'CONFLICT',
	MERGE_REQUIRED = 'MERGE_REQUIRED',
}

/** Trạng thái apply của từng item. */
export enum AssetImportItemStatus {
	PENDING = 'PENDING',
	APPLIED = 'APPLIED',
	SKIPPED = 'SKIPPED',
	FAILED = 'FAILED',
}

/**
 * Kiểu thay đổi của từng field trong diff — FE dùng để tô màu và
 * cảnh báo user trước khi convert.
 */
export enum AssetImportChangeType {
	/** Đè lên giá trị đã có */
	OVERWRITE = 'overwrite',
	/** Điền vào ô đang null/rỗng */
	FILL_EMPTY = 'fill_empty',
	/** Tạo bản ghi mới */
	CREATE = 'create',
	/**
	 * Hệ thống tự chọn giá trị vì file không cung cấp — hiện chỉ dùng cho label
	 * khi dòng đổi workspace mà không có cột Label Name. Xem `note` để biết lý do.
	 */
	AUTO_SELECT = 'auto_select',
}

export enum FieldOrderAssetImportBatch {
	CREATED_AT = 'batch.createdAt',
	UPDATED_AT = 'batch.updatedAt',
	FILE_NAME = 'batch.fileName',
	STATUS = 'batch.status',
}

export enum FieldOrderAssetImportItem {
	ROW_NUMBER = 'item.rowNumber',
	CREATED_AT = 'item.createdAt',
	ACTION = 'item.action',
	STATUS = 'item.status',
}
