export enum ExecutionStatus {
    QUEUED = 'QUEUED',
    RUNNING = 'RUNNING',
    AWAITING_ACTION = 'AWAITING_ACTION', // Required manual intervention
    PARTIALLY_COMPLETED = 'PARTIALLY_COMPLETED',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
    CANCELLED = 'CANCELLED'
}

export enum ExecutionType {
    INITIAL_RELEASE = 'INITIAL_RELEASE',
    UPDATE = 'UPDATE',
    TAKEDOWN = 'TAKEDOWN',
    RETRY = 'RETRY'
}

export enum StepType {
    CREATE_METADATA = 'CREATE_METADATA',
    UPLOAD_SFTP = 'UPLOAD_SFTP',
    POST_UPLOAD_HOOK = 'POST_UPLOAD_HOOK', // Tạo thư mục .done
    EXPORT_EXCEL = 'EXPORT_EXCEL', // Sinh file excel
    SEND_EMAIL = 'SEND_EMAIL', // Gửi email
    WAITING_EXPORT = 'WAITING_EXPORT', // Chờ Admin xuất và upload thủ công
    CLEANUP = 'CLEANUP'
}

export enum StepStatus {
    PENDING = 'PENDING',
    RUNNING = 'RUNNING',
    SUCCESS = 'SUCCESS',
    FAILED = 'FAILED',
    SKIPPED = 'SKIPPED',
    WAITING_ACTION = 'WAITING_ACTION',
    CANCELLED = 'CANCELLED'
}
