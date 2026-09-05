import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
	IsEnum,
	Allow,
	ArrayNotEmpty,
	IsArray,
	IsIn,
	IsOptional,
	IsString,
	IsUUID,
	Matches,
} from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/common.base-query.dto';
import { OrderDirection } from 'src/common/enums/common';
import { ImportJobStatus } from 'src/modules/etl/interfaces';
import type { AnalyticsVideoScope } from '../services/analytics-video-scope.service';

const normalizeOptionalReleaseType = (value: unknown): unknown => {
	if (typeof value !== 'string') return value;

	const normalized = value.trim().toLowerCase();
	return normalized === '' || normalized === 'all' ? undefined : normalized;
};

const normalizeToMonth = (value: unknown): unknown => {
	if (typeof value !== 'string') return value;
	const trimmed = value.trim();
	// Accept YYYY-MM and YYYY-MM-DD (analytics sends YYYY-MM-DD) -> normalize to YYYY-MM
	const m = trimmed.match(/^(\d{4})-(0[1-9]|1[0-2])(?:-\d{2})?$/);
	if (m) return `${m[1]}-${m[2]}`;
	return trimmed;
};

export class AnalyticsReportExportDto {
	/** Server-only scope injected from the authenticated request. */
	@Allow()
	analyticsVideoScope?: AnalyticsVideoScope;
	@ApiProperty({
		description:
			'Start month of the report range. Accepts YYYY-MM or YYYY-MM-DD (day is ignored, normalized to month).',
		example: '2026-01',
	})
	@Transform(({ value }) => normalizeToMonth(value))
	@Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
	fromDate: string;

	@ApiProperty({
		description:
			'End month of the report range. Accepts YYYY-MM or YYYY-MM-DD (day is ignored, normalized to month).',
		example: '2026-06',
	})
	@Transform(({ value }) => normalizeToMonth(value))
	@Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
	endDate: string;

	@ApiPropertyOptional({
		description: 'Export format. Defaults to xlsx.',
		enum: ['xlsx', 'csv'],
		default: 'xlsx',
	})
	@IsOptional()
	@IsIn(['xlsx', 'csv'])
	format?: 'xlsx' | 'csv' = 'xlsx';

	@ApiPropertyOptional({ description: 'Filter by label ID' })
	@IsOptional()
	@IsString()
	labelId?: string;

	@ApiPropertyOptional({ description: 'Filter by artist ID' })
	@IsOptional()
	@IsString()
	artistId?: string;

	@ApiPropertyOptional({ description: 'Filter by release ID' })
	@IsOptional()
	@IsString()
	releaseId?: string;

	@ApiPropertyOptional({
		description: 'Filter by DSP ID, DSP report ID, DSP UUID, or DSP code (legacy generic)',
	})
	@IsOptional()
	@IsString()
	dspId?: string;

	@ApiPropertyOptional({
		description:
			'Filter by mapped Postgres DSP UUID (pg_uuid). Takes precedence over dspReportId/dspId.',
	})
	@IsOptional()
	@IsString()
	pgDspId?: string;

	@ApiPropertyOptional({
		description:
			'Filter by raw ClickHouse DSP report ID (s.dsp_id). Ignored when pgDspId is supplied.',
	})
	@IsOptional()
	@IsString()
	dspReportId?: string;

	@ApiPropertyOptional({
		description: 'Filter by exact ISRC (replaces trackId)',
		example: 'USUM72601234',
	})
	@IsOptional()
	@IsString()
	isrc?: string;

	@ApiPropertyOptional({
		description: 'Filter by channel UUID (video)',
		format: 'uuid',
	})
	@IsOptional()
	@IsString()
	channelId?: string;

	@ApiPropertyOptional({
		description: 'Filter by raw import source (s.import_source)',
		example: 'wmg_report',
	})
	@IsOptional()
	@IsString()
	@Matches(/^[a-z0-9_]+$/)
	importSource?: string;

	@ApiPropertyOptional({
		description:
			'Single workspace/tenant filter. Mirrors analytics tenantId filter. ' +
			'System tenant may filter any workspace; normal tenant only descendant. ' +
			'Mutually exclusive with tenantIds.',
		format: 'uuid',
	})
	@IsOptional()
	@IsUUID('4')
	tenantId?: string;

	@ApiPropertyOptional({
		description:
			'Danh sách workspace/tenant ID cần lọc dữ liệu. ' +
			'Chỉ được chọn workspace hiện tại + workspace con trực tiếp/gián tiếp từ token. ' +
			'System tenant được chọn bất kỳ workspace. ' +
			'Mutually exclusive with tenantId. ' +
			'Mặc định: [workspace hiện tại] nếu không truyền.',
		type: [String],
		example: ['5f31ab56-2cbe-4ac2-a6d5-425574040f3e'],
	})
	@IsOptional()
	@IsArray()
	@IsUUID('4', { each: true })
	tenantIds?: string[];

	@ApiPropertyOptional({
		description:
			'Filter by release type: audio or video. Omit to include both.',
		enum: ['audio', 'video'],
		example: 'audio',
	})
	@Transform(({ value }) => normalizeOptionalReleaseType(value))
	@IsOptional()
	@IsIn(['audio', 'video'])
	releaseType?: 'audio' | 'video';
}

export class CancelAnalyticsReportExportJobsDto {
	@ApiProperty({
		description: 'List of analytics report export job IDs to cancel',
		type: [String],
		example: [
			'5f31ab56-2cbe-4ac2-a6d5-425574040f3e',
			'7a51a118-ca40-41d5-9b38-6d5ef615b84c',
		],
	})
	@IsArray()
	@ArrayNotEmpty()
	@IsUUID('4', { each: true })
	jobIds: string[];
}

export class QueryAnalyticsReportExportsDto extends BaseQueryDto {
	@ApiPropertyOptional({
		description: 'Filter by job status',
		enum: ImportJobStatus,
		required: false,
	})
	@IsOptional()
	@IsEnum(ImportJobStatus)
	status?: ImportJobStatus;

	@ApiPropertyOptional({
		description:
			'Filter by tenant. System tenant can filter any; normal tenants are forced to own tenant.',
		required: false,
	})
	@IsOptional()
	@IsString()
	tenantId?: string;

	@ApiPropertyOptional({
		description: 'Field to order by',
		default: 'createdAt',
		example: 'createdAt',
	})
	@IsOptional()
	@IsString()
	fieldOrder: string = 'createdAt';

	@ApiPropertyOptional({
		description: 'Order direction',
		enum: OrderDirection,
		default: OrderDirection.DESC,
		example: OrderDirection.DESC,
	})
	@IsOptional()
	@IsEnum(OrderDirection)
	orderBy: OrderDirection = OrderDirection.DESC;
}
