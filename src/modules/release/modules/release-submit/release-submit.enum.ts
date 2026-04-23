export enum ReleaseSubmitStatus {
	NEW = 'NEW',
	PROCESSING = 'PROCESSING',
	WAITING_ACTION = 'WAITING_ACTION',
	DONE = 'DONE',
	FAILED = 'FAILED',
}

export enum SubmitStepStatus {
	NEW = 'NEW',
	PROCESSING = 'PROCESSING',
	WAITING_ACTION = 'WAITING_ACTION',
	DONE = 'DONE',
	FAILED = 'FAILED',
	SKIPPED = 'SKIPPED',
}


/**
 * Step types — enum chỉ dùng ở code (type safety + autocomplete).
 * DB lưu varchar, nên thêm type mới chỉ cần thêm vào enum này, không cần migration.
 */
export enum SubmitStepType {
	// === Simple steps (no DSP, no sub-steps) ===
	GEN_UPC = 'GEN_UPC',
	GEN_ISRCS = 'GEN_ISRCS',
	GEN_ISRC = 'GEN_ISRC',
	VALIDATE = 'VALIDATE',

	// === Parent group steps ===
	PROCESS_DIRECT = 'PROCESS_DIRECT',
	PROCESS_AGG_CI = 'PROCESS_AGG_CI',

	// === Direct DSP sub-steps ===
	CREATE_METADATA_DIRECT = 'CREATE_METADATA_DIRECT',
	UPLOAD_SFTP_DIRECT = 'UPLOAD_SFTP_DIRECT',
	SYNC_DATA_FROM_DSP = 'SYNC_DATA_FROM_DSP',

	// === CI Aggregator sub-steps ===
	CREATE_METADATA_CI = 'CREATE_METADATA_CI',
	UPLOAD_SFTP_CI = 'UPLOAD_SFTP_CI',
	CREATE_FOLDER_DONE_CI = 'CREATE_FOLDER_DONE_CI',
	GET_QA_FLAG_CI = 'GET_QA_FLAG_CI',
	SEND_EMAIL_TO_STATE = 'SEND_EMAIL_TO_STATE',
	WAITING_ADMIN_EXPORT = 'WAITING_ADMIN_EXPORT',
	SYNC_DATA_DSP_CI = 'SYNC_DATA_DSP_CI',
}

export enum SubmitLogLevel {
	SUCCESS = 'SUCCESS',
	LOG = 'LOG',
	ERROR = 'ERROR',
	WARNING = 'WARNING',
}
