import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
	IsArray,
	IsBoolean,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsString,
	Matches,
	ValidateNested,
} from 'class-validator';
import { ImportJob, ImportJobSourceType } from '../../etl/interfaces';
import { computeProgressDetail } from '../../etl/services/import-jobs/import-jobs.service';
import {
	ReportImportStartResponse,
	ReportImportStatusResponse,
} from '../interfaces/report-import.interface';

export enum ReportReleaseImportSourceType {
	REPORT_UPLOAD = ImportJobSourceType.REPORT_UPLOAD,
	FTP_SYNC_PERIOD = ImportJobSourceType.FTP_SYNC_PERIOD,
	FTP_SYNC_ALL = ImportJobSourceType.FTP_SYNC_ALL,
	FTP_RETRY = ImportJobSourceType.FTP_RETRY,
	FTP_AUTO_CRON = ImportJobSourceType.FTP_AUTO_CRON,
}

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
	@ApiProperty({
		type: [PreValidateFileDto],
		description: 'List of files to pre-validate',
	})
	@IsNotEmpty()
	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => PreValidateFileDto)
	files: PreValidateFileDto[];

	@ApiPropertyOptional({
		description: 'Optional default Tenant ID to assign releases to',
	})
	@IsOptional()
	@IsString()
	tenantId?: string;

	@ApiPropertyOptional({
		description:
			'Optional fallback Label ID under tenantId. API-enriched labelName is prioritized when available.',
	})
	@IsOptional()
	@IsString()
	labelId?: string;

	@ApiPropertyOptional({
		description: 'Allowed file extensions (e.g. csv, txt, xlsx)',
		type: [String],
	})
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
		this.message =
			job.status === 'QUEUED'
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
	result?: any;
	detailR2Sync?: { zipsFound: number; zipsImported: number; zipsSkipped: number } | null;
	detailExport?: { jobSpoId: string | null; foldersUploaded: number; r2ObjectKeys: string[] } | null;
	createdAt: string | null;
	startedAt: string | null;
	finishedAt: string | null;
	durationMs: number;

	constructor(job: ImportJob) {
		const isR2Sync = job.sourceType === ImportJobSourceType.SPOTIFY_R2_SYNC;
		const isExportTrigger = job.sourceType === ImportJobSourceType.SPOTIFY_EXPORT_TRIGGER;

		this.id = job.id;
		this.status = job.status;
		this.progress = {
			current:
				job.status === 'COMPLETED'
					? job.progressTotal
					: job.progressCurrent,
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
		if (isR2Sync) {
			this.detailR2Sync = job.result
				? {
						zipsFound: (job.result.zipsFound as number) ?? 0,
						zipsImported: (job.result.zipsImported as number) ?? 0,
						zipsSkipped: (job.result.zipsSkipped as number) ?? 0,
					}
				: null;
		} else if (isExportTrigger) {
			this.detailExport = job.result
				? {
						jobSpoId: (job.result.jobSpoId as string) ?? null,
						foldersUploaded: (job.result.foldersUploaded as number) ?? 0,
						r2ObjectKeys: (job.result.r2ObjectKeys as string[]) ?? [],
					}
				: null;
		} else {
			this.result = job.result;
		}
		this.createdAt = toVN(job.createdAt);
		this.startedAt = toVN(job.startedAt);
		this.finishedAt = toVN(job.finishedAt);
		this.durationMs = job.durationMs;
	}
}

export class DeleteImportedReleasesDto {
	@ApiPropertyOptional({
		description:
			'Local datetime. If timezone is omitted, Asia/Saigon (UTC+7) is assumed.',
		example: '2026-01-01T08:30',
	})
	@IsOptional()
	@Transform(({ value }) => emptyToUndefined(value))
	@IsString()
	@Matches(
		/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?(?:Z|[+-]\d{2}:?\d{2})?)?$/,
	)
	fromDate?: string;

	@ApiPropertyOptional({
		description:
			'Local datetime. If timezone is omitted, Asia/Saigon (UTC+7) is assumed.',
		example: '2026-01-31T23:59',
	})
	@IsOptional()
	@Transform(({ value }) => emptyToUndefined(value))
	@IsString()
	@Matches(
		/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?(?:Z|[+-]\d{2}:?\d{2})?)?$/,
	)
	toDate?: string;

	@ApiPropertyOptional({ description: 'Tenant ID' })
	@IsOptional()
	@Transform(({ value }) => emptyToUndefined(value))
	@IsString()
	tenantId?: string;

	@ApiPropertyOptional({ description: 'Label ID' })
	@IsOptional()
	@Transform(({ value }) => emptyToUndefined(value))
	@IsString()
	labelId?: string;

	@ApiPropertyOptional({
		enum: ReportReleaseImportSourceType,
		enumName: 'ReportReleaseImportSourceType',
		example: ReportReleaseImportSourceType.REPORT_UPLOAD,
	})
	@IsOptional()
	@Transform(({ value }) => emptyToUndefined(value))
	@IsString()
	importSourceType?: ReportReleaseImportSourceType;

	@ApiPropertyOptional({ example: 'wmg-sales' })
	@IsOptional()
	@Transform(({ value }) => emptyToUndefined(value))
	@IsString()
	parserCode?: string;

	@ApiPropertyOptional({ example: 'wmg-sales-2026-01.csv' })
	@IsOptional()
	@Transform(({ value }) => emptyToUndefined(value))
	@IsString()
	fileName?: string;

	@ApiPropertyOptional({ default: false })
	@IsOptional()
	@IsBoolean()
	@Transform(({ value }) => {
		if (value === 'true' || value === true) return true;
		if (value === 'false' || value === false) return false;
		return value;
	})
	deleteAll?: boolean;
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

function emptyToUndefined(value: unknown): unknown {
	return typeof value === 'string' && value.trim() === '' ? undefined : value;
}
