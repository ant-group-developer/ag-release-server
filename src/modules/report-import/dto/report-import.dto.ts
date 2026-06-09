import { IsArray, IsNotEmpty, IsNumber, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ImportJob } from '../../etl/interfaces';
import { ReportImportStartResponse, ReportImportStatusResponse } from '../interfaces/report-import.interface';

export class PreValidateFileDto {
  @IsNotEmpty()
  @IsString()
  path: string;

  @IsNotEmpty()
  @IsNumber()
  size: number;
}

export class PreValidateRequestDto {
  @IsNotEmpty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PreValidateFileDto)
  files: PreValidateFileDto[];
}

export class ReportImportStartResponseDto implements ReportImportStartResponse {
  jobId: string;
  status: string;
  message: string;

  constructor(job: ImportJob) {
    this.jobId = job.id;
    this.status = job.status;
    this.message = 'Job processing has been started.';
  }
}

export class ReportImportStatusResponseDto implements ReportImportStatusResponse {
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

  constructor(job: ImportJob) {
    this.id = job.id;
    this.status = job.status;
    this.progress = {
      current: job.progressCurrent,
      total: job.progressTotal,
      label: job.progressLabel,
    };
    this.rows = {
      total: job.totalRows,
      processed: job.processedRows,
      skipped: job.skippedRows,
      errors: job.errorRows,
    };
    this.file = job.fileName;
    this.error = job.errorMessage || null;
    this.result = job.result;
    this.startedAt = job.startedAt;
    this.finishedAt = job.finishedAt;
    this.durationMs = job.durationMs;
  }
}
