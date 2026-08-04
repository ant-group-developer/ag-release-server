import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
	ArrayNotEmpty,
	IsArray,
	IsIn,
	IsOptional,
	IsString,
	IsUUID,
	Matches,
} from 'class-validator';
import type { AnalyticsVideoScope } from '../services/analytics-video-scope.service';

const normalizeOptionalReleaseType = (value: unknown): unknown => {
	if (typeof value !== 'string') return value;

	const normalized = value.trim().toLowerCase();
	return normalized === '' || normalized === 'all' ? undefined : normalized;
};

export class AnalyticsReportExportDto {
	/** Server-only scope injected from the authenticated request. */
	analyticsVideoScope?: AnalyticsVideoScope;
	@ApiProperty({
		description: 'Start month of the report range',
		example: '2026-01',
	})
	@Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
	fromDate: string;

	@ApiProperty({
		description: 'End month of the report range',
		example: '2026-06',
	})
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

	@ApiPropertyOptional({ description: 'Filter by track ID' })
	@IsOptional()
	@IsString()
	trackId?: string;

	@ApiPropertyOptional({
		description: 'Filter by DSP ID, DSP report ID, DSP UUID, or DSP code',
	})
	@IsOptional()
	@IsString()
	dspId?: string;

	// ─── NEW FIELDS ──────────────────────────────────────────────

	@ApiPropertyOptional({
		description:
			'Danh sách workspace/tenant ID cần lọc dữ liệu. ' +
			'Chỉ được chọn workspace hiện tại + workspace con trực tiếp/gián tiếp. ' +
			'System tenant được chọn bất kỳ workspace. ' +
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
			'Export separate subfolders for each artist under the tenant.',
		type: Boolean,
		default: false,
	})
	@IsOptional()
	isExportArtist?: boolean = false;

	@ApiPropertyOptional({
		description:
			'Split data by period unit. "month" = monthly, "quarter" = quarterly, "none" = no splitting.',
		enum: ['month', 'quarter', 'none'],
		default: 'none',
	})
	@IsOptional()
	@IsIn(['month', 'quarter', 'none'])
	periodUnit?: 'month' | 'quarter' | 'none' = 'none';

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
