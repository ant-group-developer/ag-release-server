export enum ImportJobSourceType {
  REPORT_UPLOAD = 'REPORT_UPLOAD',
  ANALYTICS_REPORT_EXPORT = 'ANALYTICS_REPORT_EXPORT',
  REPORT_RELEASE_DELETE = 'REPORT_RELEASE_DELETE',
  FTP_SYNC_PERIOD = 'FTP_SYNC_PERIOD',
  FTP_SYNC_ALL = 'FTP_SYNC_ALL',
  FTP_RETRY = 'FTP_RETRY',
  FTP_AUTO_CRON = 'FTP_AUTO_CRON',
}

export enum ImportJobStatus {
  PENDING = 'PENDING',
  QUEUED = 'QUEUED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

/**
 * Row đúng theo schema ClickHouse `music_analytics.import_jobs`.
 * `params` / `result` là JSON string (ClickHouse không có native object column).
 */
export interface ImportJobRow {
  id: string;
  source_type: ImportJobSourceType;
  status: ImportJobStatus;

  file_name: string;
  file_path: string;
  file_size_bytes: number;
  file_hash: string;

  params: string;

  progress_current: number;
  progress_total: number;
  progress_label: string;

  total_rows: number;
  processed_rows: number;
  skipped_rows: number;
  error_rows: number;

  result: string;
  error_message: string;
  batch_id: string;

  tenant_id: string;
  created_by: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number;
  updated_at: string;
}

/**
 * Domain object — ngược với ImportJobRow, params/result đã parse object.
 */
export interface ImportJob {
  id: string;
  sourceType: ImportJobSourceType;
  status: ImportJobStatus;

  fileName: string;
  filePath: string;
  fileSizeBytes: number;
  fileHash: string;

  params: Record<string, unknown>;

  progressCurrent: number;
  progressTotal: number;
  progressLabel: string;

  totalRows: number;
  processedRows: number;
  skippedRows: number;
  errorRows: number;

  result: Record<string, unknown> | null;
  errorMessage: string;
  batchId: string;

  tenantId: string;
  createdBy: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number;
  updatedAt: string;
}

export interface CreateImportJobInput {
  sourceType: ImportJobSourceType;
  params?: Record<string, unknown>;
  fileName?: string;
  filePath?: string;
  fileSizeBytes?: number;
  fileHash?: string;
  progressTotal?: number;
  tenantId?: string;
  createdBy?: string;
}

export interface UpdateProgressPatch {
  progressCurrent?: number;
  progressTotal?: number;
  progressLabel?: string;
  processedRows?: number;
  skippedRows?: number;
  errorRows?: number;
  totalRows?: number;
}

export interface ListImportJobsFilters {
  sourceType?: ImportJobSourceType;
  status?: ImportJobStatus;
  tenantId?: string;
  limit?: number;
  offset?: number;
  fieldOrder?: string;
  orderBy?: 'ASC' | 'DESC';
}
