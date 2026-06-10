export interface ReportImportFileResult {
  path: string;
  r2Key: string;
  uploadUrl: string;
}

export interface ReportImportInvalidFileResult {
  path: string;
  reason: string;
}

export interface ReportImportPreValidateResponse {
  jobId: string | null;
  matched: ReportImportFileResult[];
  invalid: ReportImportInvalidFileResult[];
}

export interface ReportImportStartResponse {
  jobId: string;
  status: string;
  message: string;
}

export interface ReportImportStatusResponse {
  id: string;
  status: string;
  progress: {
    current: number;
    total: number;
    label: string;
  };
  rows: {
    total: number;
    processed: number;
    skipped: number;
    errors: number;
  };
  file: string;
  error: string | null;
  result: any;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number;
}
