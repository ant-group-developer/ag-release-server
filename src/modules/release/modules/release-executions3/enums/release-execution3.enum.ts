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
}

/**
 * Step types — enum chỉ dùng ở code (type safety + autocomplete).
 * DB lưu varchar, nên thêm type mới chỉ cần thêm vào enum này, không cần migration.
 */
export enum ReleaseExecutionStepType {
	// === Simple steps (no DSP, no sub-steps) ===
	GEN_UPC = 'GEN_UPC',
	GEN_ISRCS = 'GEN_ISRCS',
	GEN_ISRC = 'GEN_ISRC',
	VALIDATE = 'VALIDATE',

	// === Parent group steps ===
	PROCESS_DIRECT = 'PROCESS_DIRECT',
	PROCESS_AGG_CI = 'PROCESS_AGG_CI',

	// === Direct DSP sub-steps ===
	CREATE_AND_UPLOAD_DIRECT = 'CREATE_AND_UPLOAD_DIRECT',
	SYNC_DATA_FROM_DSP = 'SYNC_DATA_FROM_DSP',

	// === CI Aggregator sub-steps ===
	CREATE_AND_UPLOAD_CI = 'CREATE_AND_UPLOAD_CI',
	CREATE_FOLDER_DONE_CI = 'CREATE_FOLDER_DONE_CI',
	VALIDATE_QA_CI = 'VALIDATE_QA_CI',
	EXPORT_CI = 'EXPORT_CI',
	SEND_EMAIL_TO_STATE = 'SEND_EMAIL_TO_STATE',
	WAITING_ADMIN_EXPORT = 'WAITING_ADMIN_EXPORT',
	SYNC_DATA_DSP_CI = 'SYNC_DATA_DSP_CI',

	// === Shared steps ===
	WAIT_PARTNER_PROCESS = 'WAIT_PARTNER_PROCESS',
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
