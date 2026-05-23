export enum ReleaseExecutionStatus {
	NEW = 'NEW',
	PROCESSING = 'PROCESSING',
	WAITING_ACTION = 'WAITING_ACTION',
	PARTIAL_DONE = 'PARTIAL_DONE',
	DONE = 'DONE',
	FAILED = 'FAILED',
	CANCELLED = 'CANCELLED',
}

export enum ExecutionType {
	INITIAL_RELEASE = 'INITIAL_RELEASE',
	UPDATE = 'UPDATE',
	TAKEDOWN = 'TAKEDOWN',
	RETRY = 'RETRY',
}

export enum ReleaseExecutionStepStatus {
	NEW = 'NEW',
	PROCESSING = 'PROCESSING',
	WAITING_ACTION = 'WAITING_ACTION',
	WAITING_PARTNER = 'WAITING_PARTNER',
	DONE = 'DONE',
	FAILED = 'FAILED',
	SKIPPED = 'SKIPPED',
	CANCELLED = 'CANCELLED',
}

/**
 * Step types — enum chỉ dùng ở code (type safety + autocomplete).
 * DB lưu varchar, nên thêm type mới chỉ cần thêm vào enum này, không cần migration.
 */
export enum ReleaseExecutionStepType {
	// === Root ===
	GEN_UPC = 'GEN_UPC',
	GEN_ISRCS = 'GEN_ISRCS',
	GEN_ISRC = 'GEN_ISRC',
	VALIDATE = 'VALIDATE',
	PROCESS_DSPS = 'PROCESS_DSPS',

	// === Direct DSP ===
	PROCESS_DIRECT = 'PROCESS_DIRECT',
	PROCESS_DIRECT_CHILD = 'PROCESS_DIRECT_CHILD',
	// CREATE_METADATA_ON_SERVER = 'CREATE_METADATA_ON_SERVER',
	// UPLOAD_METADATA_TO_SFTP = 'UPLOAD_METADATA_TO_SFTP
	SYNC_DATA_PARTNER = 'SYNC_DATA_PARTNER',

	// === CI Aggregator ===
	PROCESS_AGG = 'PROCESS_AGG',
	PROCESS_AGG_CI = 'PROCESS_AGG_CI',
	IMPORT = 'IMPORT',
	EXPORT = 'EXPORT',
	// CREATE_METADATA_ON_SERVER = 'CREATE_METADATA_ON_SERVER',
	// UPLOAD_METADATA_TO_SFTP = 'UPLOAD_METADATA_TO_SFTP
	CREATE_FOLDER_DONE_CI = 'CREATE_FOLDER_DONE_CI',
	VALIDATE_QA_CI = 'VALIDATE_QA_CI',

	CI = 'CI',
	STATE51 = 'STATE51',
	WAITING_ADMIN_EXPORT = 'WAITING_ADMIN_EXPORT',
	SEND_EMAIL_STATE51 = 'SEND_EMAIL_STATE51',
	SYNC_DATA_DSP_CI = 'SYNC_DATA_DSP_CI',

	// === Shared ===
	WAIT_PARTNER_PROCESS = 'WAIT_PARTNER_PROCESS',
	CREATE_METADATA_ON_SERVER = 'CREATE_METADATA_ON_SERVER',
	UPLOAD_METADATA_TO_SFTP = 'UPLOAD_METADATA_TO_SFTP',
}

export enum ExecutionStepMode {
	SEQUENTIAL = 'sequential', // chạy tuần tự, bước sau chờ bước trước
	PARALLEL = 'parallel', // chạy đồng thời tất cả
}

/**
 * Quy tắc xử lý khi step thất bại
 */
export enum ExecutionStepFailurePolicy {
	/** Fail → dừng các step anh em phía sau, báo cha FAILED */
	STOP_ALL = 'STOP_ALL',

	/** Fail → chỉ fail branch hiện tại, branch khác vẫn chạy */
	ISOLATE = 'ISOLATE',

	/** Chỉ fail cha khi tất cả children đều fail */
	ANY_SUCCESS = 'ANY_SUCCESS',
}
