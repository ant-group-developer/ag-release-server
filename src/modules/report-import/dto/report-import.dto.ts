import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ImportJob } from '../../etl/interfaces';
import { computeProgressDetail } from '../../etl/services/import-jobs/import-jobs.service';
import { ReportImportStartResponse, ReportImportStatusResponse } from '../interfaces/report-import.interface';

export class PreValidateFileDto {
  @ApiProperty({ description: 'Original local file path' })
  @IsNotEmpty()
  @IsString()
  path: string;

  @ApiProperty({ description: 'File size in bytes' })
  @IsNotEmpty()
  @IsNumber()
  size: number;
}

export class PreValidateRequestDto {
  @ApiProperty({ type: [PreValidateFileDto], description: 'List of files to pre-validate' })
  @IsNotEmpty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PreValidateFileDto)
  files: PreValidateFileDto[];

  @ApiPropertyOptional({ description: 'Optional default Tenant ID to assign releases to' })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiPropertyOptional({
    description: 'Optional fallback Label ID under tenantId. API-enriched labelName is prioritized when available.',
  })
  @IsOptional()
  @IsString()
  labelId?: string;

  @ApiPropertyOptional({ description: 'Allowed file extensions (e.g. csv, txt, xlsx)', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedExtensions?: string[];
}

export class ReportImportStartResponseDto implements ReportImportStartResponse {
  jobId: string;
  status: string;
  message: string;

  constructor(job: ImportJob) {
    this.jobId = job.id;
    this.status = job.status;
    this.message = job.status === 'QUEUED'
      ? 'Job has been queued for background processing.'
      : 'Job processing has been started.';
  }
}

export class ReportImportStatusResponseDto implements ReportImportStatusResponse {
  id: string;
  status: string;
  progress: {
    current: number;
    total: number;
    label: string;
    detail?: any;
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
  createdAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number;

  constructor(job: ImportJob) {
    this.id = job.id;
    this.status = job.status;
    this.progress = {
      current: job.status === 'COMPLETED' ? job.progressTotal : job.progressCurrent,
      total: job.progressTotal,
      label: job.status === 'COMPLETED' ? 'Done' : job.progressLabel,
      detail: computeProgressDetail(job),
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
    this.createdAt = toVN(job.createdAt);
    this.startedAt = toVN(job.startedAt);
    this.finishedAt = toVN(job.finishedAt);
    this.durationMs = job.durationMs;
  }
}

function toVN(dt: string | null): string | null {
  if (!dt) return null;
  try {
    const utc = new Date(dt.replace(' ', 'T') + 'Z');
    if (isNaN(utc.getTime())) return dt;
    const vn = new Date(utc.getTime() + 7 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const ms = String(vn.getUTCMilliseconds()).padStart(3, '0');
    return `${vn.getUTCFullYear()}-${pad(vn.getUTCMonth() + 1)}-${pad(vn.getUTCDate())}T${pad(vn.getUTCHours())}:${pad(vn.getUTCMinutes())}:${pad(vn.getUTCSeconds())}.${ms}+07:00`;
  } catch {
    return dt;
  }
}
