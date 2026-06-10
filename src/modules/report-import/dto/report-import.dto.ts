import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ImportJob } from '../../etl/interfaces';
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

  @ApiProperty({ description: 'Optional default Tenant ID to assign releases to', required: false })
  @IsOptional()
  @IsString()
  tenantId?: string;

  @ApiProperty({ description: 'Allowed file extensions (e.g. csv, txt, xlsx)', required: false, type: [String] })
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
