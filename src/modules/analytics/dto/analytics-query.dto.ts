import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
	Allow,
	ArrayMaxSize,
	ArrayNotEmpty,
	ArrayUnique,
	IsArray,
	IsBoolean,
	IsDateString,
	IsEnum,
	IsIn,
	IsInt,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	Max,
	Min,
	Validate,
	ValidateNested,
	ValidatorConstraint,
	ValidatorConstraintInterface,
} from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/common.base-query.dto';
import type { AnalyticsVideoScope } from '../services/analytics-video-scope.service';

const normalizeOptionalReleaseType = (value: unknown): unknown => {
	if (typeof value !== 'string') return value;

	const normalized = value.trim().toLowerCase();
	return normalized === '' || normalized === 'all' ? undefined : normalized;
};

export const ANALYTICS_SERIES_BY_VALUES = [
	'auto',
	'isrc',
	'release',
	'channel',
	'artist',
	'label',
	'tenant',
	'dsp',
	'importSource',
] as const;

export type AnalyticsSeriesBy = (typeof ANALYTICS_SERIES_BY_VALUES)[number];

const MAX_ANALYTICS_FILTER_VALUES = 200;

@ValidatorConstraint({ name: 'hasDspIdentifier', async: false })
class HasDspIdentifierConstraint implements ValidatorConstraintInterface {
	validate(value: AnalyticsDspIdDto): boolean {
		return Boolean(value?.pgDspId || value?.dspReportIds?.length);
	}

	defaultMessage(): string {
		return 'Each DSP filter must include pgDspId or dspReportId';
	}
}

/**
 * pgDspId is the canonical DSP identifier. When present, it scopes all raw
 * reports mapped to that DSP; dspReportId is only a fallback when pgDspId is
 * absent.
 */
export class AnalyticsDspIdDto {
	@ApiPropertyOptional({
		description:
			'Canonical mapped DSP ID. When present, all raw reports mapped to this DSP are included.',
		example: 'oyGd-maAdA',
	})
	@IsOptional()
	@IsString()
	pgDspId?: string;

	@ApiPropertyOptional({
		description:
			'Raw DSP report IDs. Used only when pgDspId is not supplied.',
		example: [
			'2e73130c-b957-4524-85e6-96f488ff5b6a',
			'3318cdc3-2ee1-4c8b-9b1d-83c29b743ba2',
		],
	})
	@IsOptional()
	@IsArray()
	@ArrayNotEmpty()
	@ArrayUnique()
	@ArrayMaxSize(MAX_ANALYTICS_FILTER_VALUES)
	@IsString({ each: true })
	dspReportIds?: string[];
}

export class AnalyticsFilterSetDto {
	@ApiPropertyOptional({ type: [String], format: 'uuid' })
	@IsOptional()
	@IsArray()
	@ArrayNotEmpty()
	@ArrayUnique()
	@ArrayMaxSize(MAX_ANALYTICS_FILTER_VALUES)
	@IsUUID('4', { each: true })
	tenantIds?: string[];

	@ApiPropertyOptional({ type: [String] })
	@IsOptional()
	@IsArray()
	@ArrayNotEmpty()
	@ArrayUnique()
	@ArrayMaxSize(MAX_ANALYTICS_FILTER_VALUES)
	@IsString({ each: true })
	labelIds?: string[];

	@ApiPropertyOptional({ type: [String] })
	@IsOptional()
	@IsArray()
	@ArrayNotEmpty()
	@ArrayUnique()
	@ArrayMaxSize(MAX_ANALYTICS_FILTER_VALUES)
	@IsString({ each: true })
	artistIds?: string[];

	@ApiPropertyOptional({ type: [String], format: 'uuid' })
	@IsOptional()
	@IsArray()
	@ArrayNotEmpty()
	@ArrayUnique()
	@ArrayMaxSize(MAX_ANALYTICS_FILTER_VALUES)
	@IsUUID('4', { each: true })
	releaseIds?: string[];

	@ApiPropertyOptional({ type: [String], format: 'uuid' })
	@IsOptional()
	@IsArray()
	@ArrayNotEmpty()
	@ArrayUnique()
	@ArrayMaxSize(MAX_ANALYTICS_FILTER_VALUES)
	@IsUUID('4', { each: true })
	channelIds?: string[];

	@ApiPropertyOptional({ type: [String] })
	@IsOptional()
	@IsArray()
	@ArrayNotEmpty()
	@ArrayUnique()
	@ArrayMaxSize(MAX_ANALYTICS_FILTER_VALUES)
	@IsString({ each: true })
	isrcs?: string[];

	@ApiPropertyOptional({ type: [String] })
	@IsOptional()
	@IsArray()
	@ArrayNotEmpty()
	@ArrayUnique()
	@ArrayMaxSize(MAX_ANALYTICS_FILTER_VALUES)
	@IsString({ each: true })
	importSources?: string[];

	@ApiPropertyOptional({
		type: [AnalyticsDspIdDto],
		description:
			'Canonical DSP filters. pgDspId takes precedence and includes all mapped reports; dspReportId is fallback-only.',
		example: [
			{ pgDspId: 'oyGd-maAdA' },
			{
				dspReportIds: [
					'2e73130c-b957-4524-85e6-96f488ff5b6a',
					'3318cdc3-2ee1-4c8b-9b1d-83c29b743ba2',
				],
			},
		],
	})
	@IsOptional()
	@IsArray()
	@ArrayNotEmpty()
	@ArrayUnique(
		(item: AnalyticsDspIdDto) =>
			`${item.pgDspId ?? ''}\u001f${(item.dspReportIds ?? []).join('\u001e')}`,
	)
	@ArrayMaxSize(MAX_ANALYTICS_FILTER_VALUES)
	@ValidateNested({ each: true })
	@Type(() => AnalyticsDspIdDto)
	@Validate(HasDspIdentifierConstraint, { each: true })
	dspIds?: AnalyticsDspIdDto[];
}

/**
 * Base DTO cho tất cả analytics queries.
 * Extends BaseQueryDto để dùng chung page/pageSize pagination.
 * Thêm fromDate/toDate bắt buộc cho analytics.
 */
export abstract class BaseAnalyticsQueryDto extends BaseQueryDto {
	/** Server-only scope injected from the authenticated request. */
	@Allow()
	analyticsVideoScope?: AnalyticsVideoScope;

	@ApiProperty({
		description: 'Start date of the filter range (inclusive)',
		example: '2026-01-01',
	})
	@IsDateString()
	fromDate: string;

	@ApiProperty({
		description: 'End date of the filter range (inclusive)',
		example: '2026-06-30',
	})
	@IsDateString()
	toDate: string;

	@ApiPropertyOptional({
		description: 'Filter analytics by specific Label ID',
		example: 'LBL_01',
	})
	@IsOptional()
	@IsString()
	labelId?: string;

	@ApiPropertyOptional({
		description:
			'Filter ranking to specific DSP ID (e.g. spotify, apple_music)',
		example: 'spotify',
	})
	@IsOptional()
	@IsString()
	dspId?: string;

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

	@ApiPropertyOptional({
		description:
			'Filter by raw import source. Source labels and images are configured dynamically by a system admin.',
		example: 'wmg_report',
	})
	@IsOptional()
	@IsString()
	importSource?: string;

	@ApiPropertyOptional({
		description:
			'If true, each item in the response includes a bySource breakdown showing views/revenue split by import_source.',
		default: false,
	})
	@IsOptional()
	@Type(() => Boolean)
	@IsBoolean()
	groupBySource?: boolean;
}

/**
 * DTO cho các API Timelines (DSP, Territory).
 * Extends BaseAnalyticsQueryDto + thêm topN, includeOther, releaseId.
 */
export class TimelineQueryDto extends BaseAnalyticsQueryDto {
	@ApiPropertyOptional({
		description:
			'Tenant/workspace UUID. Only system tenants may filter another tenant.',
		format: 'uuid',
	})
	@IsOptional()
	@IsUUID()
	tenantId?: string;

	@ApiPropertyOptional({
		description:
			'Filter by a specific artist ID (external IDs are supported).',
	})
	@IsOptional()
	@IsString()
	artistId?: string;

	@ApiPropertyOptional({
		description: 'Filter by a specific channel UUID',
		format: 'uuid',
	})
	@IsOptional()
	@IsUUID()
	channelId?: string;

	@ApiPropertyOptional({
		description: 'Filter by an exact ISRC',
		example: 'USUM72601234',
	})
	@IsOptional()
	@IsString()
	isrc?: string;

	@ApiPropertyOptional({
		description:
			'Filter by raw ClickHouse DSP report ID. Ignored when pgDspId is supplied.',
	})
	@IsOptional()
	@IsString()
	dspReportId?: string;

	@ApiPropertyOptional({
		description:
			'Filter by mapped DSP ID. Takes precedence over dspReportId and supports non-UUID values.',
	})
	@IsOptional()
	@IsString()
	pgDspId?: string;

	@ApiPropertyOptional({
		description:
			'Number of top items to return individually. Remaining ones are grouped as "Other".',
		minimum: 1,
		maximum: 100,
		default: 5,
		example: 5,
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(100)
	topN?: number;

	@ApiPropertyOptional({
		description: 'Whether to group non-top items into an "Other" category',
		default: true,
		example: true,
	})
	@IsOptional()
	@Type(() => Boolean)
	@IsBoolean()
	includeOther?: boolean;

	@ApiPropertyOptional({
		description:
			'Order revenue top results by revenue (default) or usage quantity',
		enum: ['revenue', 'usage'],
		default: 'revenue',
	})
	@IsOptional()
	@IsIn(['revenue', 'usage'])
	sortBy?: 'revenue' | 'usage';

	@ApiPropertyOptional({
		description: 'Filter analytics by specific Release ID',
		format: 'uuid',
		example: '123e4567-e89b-12d3-a456-426614174000',
	})
	@IsOptional()
	@IsUUID()
	releaseId?: string;
}

/**
 * DTO cho API Rankings (tracks, releases, artists, labels).
 * Extends BaseAnalyticsQueryDto — dùng chung page/pageSize từ BaseQueryDto.
 */
export class RankingQueryDto extends BaseAnalyticsQueryDto {
	@ApiPropertyOptional({
		description: 'Filter by a specific release UUID',
		format: 'uuid',
	})
	@IsOptional()
	@IsUUID()
	releaseId?: string;

	@ApiPropertyOptional({
		description:
			'Tenant/workspace UUID. Only system tenants may filter another tenant.',
		format: 'uuid',
	})
	@IsOptional()
	@IsUUID()
	tenantId?: string;

	@ApiPropertyOptional({
		description:
			'Filter by a specific artist ID (external IDs are supported).',
	})
	@IsOptional()
	@IsString()
	artistId?: string;

	@ApiPropertyOptional({
		description: 'Filter by a specific channel UUID',
		format: 'uuid',
	})
	@IsOptional()
	@IsUUID()
	channelId?: string;

	@ApiPropertyOptional({
		description: 'Filter by an exact ISRC',
		example: 'USUM72601234',
	})
	@IsOptional()
	@IsString()
	isrc?: string;

	@ApiPropertyOptional({
		description:
			'Filter by raw ClickHouse DSP report ID. Ignored when pgDspId is supplied.',
	})
	@IsOptional()
	@IsString()
	dspReportId?: string;

	@ApiPropertyOptional({
		description:
			'Filter by mapped DSP ID. Takes precedence over dspReportId and supports non-UUID values.',
	})
	@IsOptional()
	@IsString()
	pgDspId?: string;
}

export const ANALYTICS_RANKING_METRICS = [
	'trendViews',
	'revenueUsd',
	'usage',
] as const;

export type AnalyticsRankingMetric =
	(typeof ANALYTICS_RANKING_METRICS)[number];

export const ANALYTICS_RANKING_ENTITY_TYPES = [
	'track',
	'release',
	'releaseVideo',
	'artist',
	'label',
	'tenant',
	'channel',
	'dsp',
	'sourceType',
] as const;

export type AnalyticsRankingEntityType =
	(typeof ANALYTICS_RANKING_ENTITY_TYPES)[number];

/**
 * One ranking list. `metric` selects both the fact table and the sort.
 * Array filters are the only filters; legacy scalars are not accepted.
 */
export class AnalyticsRankingV2QueryDto {
	@Allow()
	analyticsVideoScope?: AnalyticsVideoScope;

	@ApiProperty({ example: '2026-01-01' })
	@IsDateString()
	fromDate: string;

	@ApiProperty({ example: '2026-08-31' })
	@IsDateString()
	toDate: string;

	@ApiProperty({ enum: ANALYTICS_RANKING_METRICS })
	@IsIn(ANALYTICS_RANKING_METRICS)
	metric: AnalyticsRankingMetric;

	@ApiProperty({ enum: ANALYTICS_RANKING_ENTITY_TYPES })
	@IsIn(ANALYTICS_RANKING_ENTITY_TYPES)
	entityType: AnalyticsRankingEntityType;

	@ApiPropertyOptional({ default: 1, minimum: 1 })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	page: number = 1;

	@ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(100)
	pageSize: number = 20;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	keyword?: string;

	@ApiPropertyOptional({ enum: ['audio', 'video'] })
	@Transform(({ value }) => normalizeOptionalReleaseType(value))
	@IsOptional()
	@IsIn(['audio', 'video'])
	releaseType?: 'audio' | 'video';

	@ApiPropertyOptional({ default: false })
	@IsOptional()
	@Type(() => Boolean)
	@IsBoolean()
	groupBySource?: boolean;

	@ApiPropertyOptional({ type: AnalyticsFilterSetDto })
	@IsOptional()
	@ValidateNested()
	@Type(() => AnalyticsFilterSetDto)
	filters?: AnalyticsFilterSetDto;

	get skip(): number {
		return ((this.page ?? 1) - 1) * (this.pageSize ?? 20);
	}

	get limit(): number {
		return this.pageSize ?? 20;
	}
}

/**
 * Base DTO cho DSP analytics. Truyền cả pgDspId + dspReportId — ưu tiên pgDspId.
 */
export class DspAnalyticsBaseDto {
	/** Server-only scope injected from the authenticated request. */
	@Allow()
	analyticsVideoScope?: AnalyticsVideoScope;

	@ApiPropertyOptional({
		description:
			'Postgres DSP ID — lấy từ field pgDspId trong response ranking/revenue API. Ưu tiên hơn dspReportId.',
	})
	@IsOptional()
	@IsString()
	pgDspId?: string;

	@ApiPropertyOptional({
		description:
			'Raw ClickHouse DSP ID (id_dsps_report) — lấy từ field dspReportId. Dùng khi pgDspId = null.',
	})
	@IsOptional()
	@IsString()
	dspReportId?: string;
}

/**
 * DTO cho DSP overview endpoint. Chỉ cần fromDate/toDate + DSP ID.
 */
export class DspOverviewQueryDto extends DspAnalyticsBaseDto {
	@ApiProperty({
		description: 'Start date of the filter range (inclusive)',
		example: '2026-01-01',
	})
	@IsDateString()
	fromDate: string;

	@ApiProperty({
		description: 'End date of the filter range (inclusive)',
		example: '2026-06-30',
	})
	@IsDateString()
	toDate: string;

	@ApiPropertyOptional({
		description:
			'Filter by release type: audio or video. Omit to include both.',
		enum: ['audio', 'video'],
	})
	@Transform(({ value }) => normalizeOptionalReleaseType(value))
	@IsOptional()
	@IsIn(['audio', 'video'])
	releaseType?: 'audio' | 'video';
}

/**
 * DTO cho DSP chart endpoints (line-chart, bar-chart).
 */
export class DspChartQueryDto extends DspOverviewQueryDto {
	@ApiPropertyOptional({
		description:
			'Bucket granularity for the trend-view line chart: per day (default) or per month ' +
			'(buckets labeled YYYY-MM-01, covering only the days inside fromDate..toDate).',
		enum: ['day', 'month'],
		default: 'day',
	})
	@IsOptional()
	@IsIn(['day', 'month'])
	granularity?: 'day' | 'month' = 'day';
}

/**
 * DTO cho Vevo trend-view device/gender/age bar charts.
 * pgDspId/dspReportId are optional; omit them to scope only by channel/release/dates.
 */
export class VevoDemographicsBarChartQueryDto extends DspChartQueryDto {
	@ApiPropertyOptional({
		description:
			'Sort bar items by views (default). Age chart still uses age-bucket order.',
		enum: ['views'],
		default: 'views',
	})
	@IsOptional()
	@IsIn(['views'])
	sortBy?: 'views';

	@ApiPropertyOptional({
		description: 'Scope to one channel UUID (video channel page)',
		format: 'uuid',
	})
	@IsOptional()
	@IsUUID()
	channelId?: string;

	@ApiPropertyOptional({
		description: 'Scope to one release UUID (video release page)',
		format: 'uuid',
	})
	@IsOptional()
	@IsUUID()
	releaseId?: string;

	@ApiPropertyOptional({
		description: 'Filter by territory code (ISO2)',
		example: 'US',
	})
	@IsOptional()
	@IsString()
	territoryCode?: string;

	@ApiPropertyOptional({
		description: 'Filter by label ID',
	})
	@IsOptional()
	@IsString()
	labelId?: string;

	@ApiPropertyOptional({
		description: 'Filter by artist ID (external IDs supported)',
	})
	@IsOptional()
	@IsString()
	artistId?: string;
}

/** DTO dành riêng cho revenue chart của một DSP. */
export class DspRevenueChartQueryDto extends DspChartQueryDto {
	@ApiPropertyOptional({
		description:
			'Order bar-chart items by revenue (default) or usage quantity',
		enum: ['revenue', 'usage'],
		default: 'revenue',
	})
	@IsOptional()
	@IsIn(['revenue', 'usage'])
	sortBy?: 'revenue' | 'usage';
}

/**
 * DTO cho DSP top-tracks / top-releases endpoints.
 */
export class DspTopQueryDto extends DspAnalyticsBaseDto {
	@ApiProperty({
		description: 'Start date (inclusive)',
		example: '2026-01-01',
	})
	@IsDateString()
	fromDate: string;

	@ApiProperty({ description: 'End date (inclusive)', example: '2026-06-30' })
	@IsDateString()
	toDate: string;

	@ApiPropertyOptional({
		description: 'Filter by release type',
		enum: ['audio', 'video'],
	})
	@Transform(({ value }) => normalizeOptionalReleaseType(value))
	@IsOptional()
	@IsIn(['audio', 'video'])
	releaseType?: 'audio' | 'video';

	@ApiPropertyOptional({
		description: 'Sort order: views (default), usage, or revenue',
		enum: ['views', 'usage', 'revenue'],
		default: 'views',
	})
	@IsOptional()
	@IsIn(['views', 'usage', 'revenue'])
	sortBy?: 'views' | 'usage' | 'revenue';

	@ApiPropertyOptional({
		description: 'Filter by import source',
		example: 'ftp',
	})
	@IsOptional()
	@IsString()
	importSource?: string;

	@ApiPropertyOptional({ description: 'Page number', minimum: 1, default: 1 })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	page?: number;

	@ApiPropertyOptional({
		description: 'Items per page',
		minimum: 1,
		maximum: 100,
		default: 20,
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(100)
	pageSize?: number;

	@ApiPropertyOptional({
		description:
			'Limit results to top N items. When set, overrides pageSize. Combine with includeOther to aggregate the rest.',
		minimum: 1,
		maximum: 100,
		example: 5,
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(100)
	topN?: number;

	@ApiPropertyOptional({
		description:
			'When true, appends an aggregated "Other" item that sums all entries beyond the top N.',
		default: false,
		example: true,
	})
	@IsOptional()
	@Type(() => Boolean)
	@IsBoolean()
	includeOther?: boolean;

	get limit(): number {
		return this.pageSize ?? 20;
	}
	get skip(): number {
		return ((this.page ?? 1) - 1) * this.limit;
	}
}

/**
 * DTO cho các Chart APIs (line-chart, bar-chart).
 * Chỉ cần fromDate / toDate, không cần pagination.
 */
export class ChartQueryDto {
	/** Server-only scope injected from the authenticated request. */
	@Allow()
	analyticsVideoScope?: AnalyticsVideoScope;

	@ApiProperty({
		description: 'Start date of the filter range (inclusive)',
		example: '2026-01-01',
	})
	@IsDateString()
	fromDate: string;

	@ApiProperty({
		description: 'End date of the filter range (inclusive)',
		example: '2026-06-30',
	})
	@IsDateString()
	toDate: string;

	@ApiPropertyOptional({
		description: 'Filter analytics by specific Label ID',
	})
	@IsOptional()
	@IsString()
	labelId?: string;

	@ApiPropertyOptional({
		description: 'Filter analytics by specific Release ID',
		format: 'uuid',
	})
	@IsOptional()
	@IsString()
	releaseId?: string;

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

	@ApiPropertyOptional({
		description:
			'Filter by raw import source. Source labels and images are configured dynamically by a system admin.',
		example: 'wmg_report',
	})
	@IsOptional()
	@IsString()
	importSource?: string;

	@ApiPropertyOptional({
		description:
			'Tenant/workspace UUID. Only system tenants may filter another tenant.',
		format: 'uuid',
	})
	@IsOptional()
	@IsUUID()
	tenantId?: string;

	@ApiPropertyOptional({
		description:
			'Filter by a specific artist ID (external IDs are supported).',
	})
	@IsOptional()
	@IsString()
	artistId?: string;

	@ApiPropertyOptional({
		description: 'Filter by a specific channel UUID',
		format: 'uuid',
	})
	@IsOptional()
	@IsUUID()
	channelId?: string;

	@ApiPropertyOptional({
		description: 'Filter by an exact ISRC',
		example: 'USUM72601234',
	})
	@IsOptional()
	@IsString()
	isrc?: string;

	@ApiPropertyOptional({
		description:
			'Filter by raw ClickHouse DSP report ID. Ignored when pgDspId is supplied.',
	})
	@IsOptional()
	@IsString()
	dspReportId?: string;

	@ApiPropertyOptional({
		description:
			'Filter by mapped DSP ID. Takes precedence over dspReportId and supports non-UUID values.',
	})
	@IsOptional()
	@IsString()
	pgDspId?: string;

	@ApiPropertyOptional({
		description:
			'Bucket granularity for the trend-view line chart: per day (default) or per month ' +
			'(buckets labeled YYYY-MM-01, covering only the days inside fromDate..toDate).',
		enum: ['day', 'month'],
		default: 'day',
	})
	@IsOptional()
	@IsIn(['day', 'month'])
	granularity?: 'day' | 'month' = 'day';
}

/** DTO dành riêng cho revenue chart; trend-view chart không nhận sortBy này. */
export class RevenueChartQueryDto extends ChartQueryDto {
	@ApiPropertyOptional({
		description:
			'Order bar-chart items by revenue (default) or usage quantity',
		enum: ['revenue', 'usage'],
		default: 'revenue',
	})
	@IsOptional()
	@IsIn(['revenue', 'usage'])
	sortBy?: 'revenue' | 'usage';
}

/**
 * Common V2 request for summary and breakdown charts. It deliberately accepts
 * only the array-based filter contract used by V2 line charts.
 */
export class AnalyticsAggregateChartQueryDto {
	/** Server-only scope injected from the authenticated request. */
	@Allow()
	analyticsVideoScope?: AnalyticsVideoScope;

	@ApiProperty({ example: '2026-01-01' })
	@IsDateString()
	fromDate: string;

	@ApiProperty({ example: '2026-06-30' })
	@IsDateString()
	toDate: string;

	@ApiPropertyOptional({
		description: 'Filter by release type: audio or video. Omit for both.',
		enum: ['audio', 'video'],
	})
	@Transform(({ value }) => normalizeOptionalReleaseType(value))
	@IsOptional()
	@IsIn(['audio', 'video'])
	releaseType?: 'audio' | 'video';

	@ApiPropertyOptional({
		type: AnalyticsFilterSetDto,
		description:
			'Array-based analytics filters. Arrays within a field are OR; fields intersect.',
	})
	@IsOptional()
	@ValidateNested()
	@Type(() => AnalyticsFilterSetDto)
	filters?: AnalyticsFilterSetDto;
}

/** Revenue breakdown V2. Metric controls the bar ordering, not the scope. */
export class RevenueAggregateChartQueryDto extends AnalyticsAggregateChartQueryDto {
	@ApiPropertyOptional({
		enum: ['revenueUsd', 'usage'],
		default: 'revenueUsd',
		description: 'Metric used to rank revenue breakdown bars.',
	})
	@IsOptional()
	@IsIn(['revenueUsd', 'usage'])
	metric?: 'revenueUsd' | 'usage' = 'revenueUsd';
}

/**
 * The demographics cube is Vevo-only. It supports the same array scope as
 * V2 trend charts, while a dspIds filter selects Vevo pairs only.
 */
export class DemographicsAggregateChartQueryDto extends AnalyticsAggregateChartQueryDto {}

/**
 * V2 line-chart request. Filters are arrays so a chart can return one series
 * for each selected entity instead of a single scalar-filtered aggregate.
 */
export class AnalyticsSeriesChartQueryDto {
	/** Server-only scope injected from the authenticated request. */
	@Allow()
	analyticsVideoScope?: AnalyticsVideoScope;

	@ApiProperty({
		description: 'Start date of the filter range (inclusive)',
		example: '2026-01-01',
	})
	@IsDateString()
	fromDate: string;

	@ApiProperty({
		description: 'End date of the filter range (inclusive)',
		example: '2026-06-30',
	})
	@IsDateString()
	toDate: string;

	@ApiPropertyOptional({
		description: 'Filter by release type: audio or video. Omit for both.',
		enum: ['audio', 'video'],
	})
	@Transform(({ value }) => normalizeOptionalReleaseType(value))
	@IsOptional()
	@IsIn(['audio', 'video'])
	releaseType?: 'audio' | 'video';

	@ApiPropertyOptional({
		description:
			'Series dimension. auto selects the most specific non-empty filter array.',
		enum: ANALYTICS_SERIES_BY_VALUES,
		default: 'auto',
	})
	@IsOptional()
	@IsIn(ANALYTICS_SERIES_BY_VALUES)
	seriesBy?: AnalyticsSeriesBy = 'auto';

	@ApiPropertyOptional({
		type: AnalyticsFilterSetDto,
		description:
			'Array-based analytics filters. Arrays within a field are OR; fields intersect.',
	})
	@IsOptional()
	@ValidateNested()
	@Type(() => AnalyticsFilterSetDto)
	filters?: AnalyticsFilterSetDto;
}

export class TrendSeriesChartQueryDto extends AnalyticsSeriesChartQueryDto {
	@ApiPropertyOptional({
		description: 'Trend bucket granularity.',
		enum: ['day', 'month'],
		default: 'day',
	})
	@IsOptional()
	@IsIn(['day', 'month'])
	granularity?: 'day' | 'month' = 'day';
}

export class RevenueSeriesChartQueryDto extends AnalyticsSeriesChartQueryDto {}

/** DTO cho Vevo demographics endpoints (device / gender / age). */
export class DemographicsQueryDto extends ChartQueryDto {
	@ApiPropertyOptional({
		description: 'Filter by territory code (ISO2)',
		example: 'US',
	})
	@IsOptional()
	@IsString()
	territoryCode?: string;

	@ApiPropertyOptional({
		description: 'Group results by territory',
		default: false,
	})
	@IsOptional()
	@Type(() => Boolean)
	@IsBoolean()
	groupByTerritory?: boolean;
}

export class EntityTimelineQueryDto {
	/** Server-only scope injected from the authenticated request. */
	@Allow()
	analyticsVideoScope?: AnalyticsVideoScope;

	@IsDateString()
	@ApiPropertyOptional({
		description: 'Start date of the filter range (inclusive)',
		example: '2026-01-01',
	})
	@IsOptional()
	@Type(() => String)
	fromDate: string;

	@IsDateString()
	@ApiPropertyOptional({
		description: 'End date of the filter range (inclusive)',
		example: '2026-06-30',
	})
	@IsOptional()
	@Type(() => String)
	toDate: string;

	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(20)
	@ApiPropertyOptional({
		description:
			'Number of top items to return individually. Remaining ones are grouped as "Other".',
		minimum: 1,
		maximum: 20,
		default: 5,
		example: 5,
	})
	@Type(() => Number)
	topN?: number = 5;

	@IsOptional()
	@IsBoolean()
	@ApiPropertyOptional({
		description: 'Whether to group non-top items into an "Other" category',
		default: true,
		example: true,
	})
	@Type(() => Boolean)
	includeOther?: boolean = true;

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

	@ApiPropertyOptional({
		description:
			'Filter by raw import source. Source labels and images are configured dynamically by a system admin.',
		example: 'wmg_report',
	})
	@IsOptional()
	@IsString()
	importSource?: string;
}

export class EntityOverviewQueryDto {
	/** Server-only scope injected from the authenticated request. */
	@Allow()
	analyticsVideoScope?: AnalyticsVideoScope;

	@IsDateString()
	@ApiPropertyOptional({
		description: 'Start date of the filter range (inclusive)',
		example: '2026-01-01',
	})
	@IsOptional()
	@Type(() => String)
	fromDate: string;

	@IsDateString()
	@ApiPropertyOptional({
		description: 'End date of the filter range (inclusive)',
		example: '2026-06-30',
	})
	@IsOptional()
	@Type(() => String)
	toDate: string;

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

	@ApiPropertyOptional({
		description:
			'Filter by raw import source. Source labels and images are configured dynamically by a system admin.',
		example: 'wmg_report',
	})
	@IsOptional()
	@IsString()
	importSource?: string;
}

/**
 * Payload cho summary analytics. Trend views được lọc chính xác theo ngày;
 * sales usage và revenue được tổng hợp theo các tháng giao với khoảng ngày.
 */
export class AnalyticsSummaryQueryDto {
	/** Server-only scope injected from the authenticated request. */
	@Allow()
	analyticsVideoScope?: AnalyticsVideoScope;

	@ApiProperty({
		description: 'Start date of the filter range (inclusive)',
		example: '2026-01-01',
	})
	@IsDateString()
	fromDate: string;

	@ApiProperty({
		description: 'End date of the filter range (inclusive)',
		example: '2026-06-30',
	})
	@IsDateString()
	toDate: string;

	@ApiPropertyOptional({
		description: 'Filter by release type: audio or video.',
		enum: ['audio', 'video'],
		example: 'audio',
	})
	@Transform(({ value }) => normalizeOptionalReleaseType(value))
	@IsOptional()
	@IsIn(['audio', 'video'])
	releaseType?: 'audio' | 'video';

	@ApiPropertyOptional({
		description: 'Filter by raw import source.',
		example: 'wmg_report',
	})
	@IsOptional()
	@IsString()
	importSource?: string;

	@ApiPropertyOptional({
		description: 'Filter by label ID.',
		example: 'LBL_01',
	})
	@IsOptional()
	@IsString()
	labelId?: string;

	@ApiPropertyOptional({
		description:
			'Tenant/workspace UUID. Only system tenants may filter another tenant.',
		format: 'uuid',
	})
	@IsOptional()
	@IsUUID()
	tenantId?: string;

	@ApiPropertyOptional({
		description: 'Filter by artist ID (external IDs are supported).',
	})
	@IsOptional()
	@IsString()
	artistId?: string;

	@ApiPropertyOptional({
		description: 'Filter by channel UUID.',
		format: 'uuid',
	})
	@IsOptional()
	@IsUUID()
	channelId?: string;

	@ApiPropertyOptional({
		description: 'Filter by exact ISRC.',
		example: 'USUM72601234',
	})
	@IsOptional()
	@IsString()
	isrc?: string;

	@ApiPropertyOptional({
		description: 'Filter by raw ClickHouse DSP report ID.',
	})
	@IsOptional()
	@IsString()
	dspReportId?: string;

	@ApiPropertyOptional({
		description:
			'Filter by mapped DSP ID. Takes precedence over dspReportId and supports non-UUID values.',
	})
	@IsOptional()
	@IsString()
	pgDspId?: string;

	@ApiPropertyOptional({
		description: 'Filter by release UUID.',
		format: 'uuid',
		example: '123e4567-e89b-12d3-a456-426614174000',
	})
	@IsOptional()
	@IsUUID()
	releaseId?: string;
}

/** Summary payload for a specific DSP. At least one DSP identifier is required. */
export class DspAnalyticsSummaryQueryDto extends DspAnalyticsBaseDto {
	@ApiProperty({
		description: 'Start date of the filter range (inclusive)',
		example: '2026-01-01',
	})
	@IsDateString()
	fromDate: string;

	@ApiProperty({
		description: 'End date of the filter range (inclusive)',
		example: '2026-06-30',
	})
	@IsDateString()
	toDate: string;

	@ApiPropertyOptional({ enum: ['audio', 'video'], example: 'audio' })
	@Transform(({ value }) => normalizeOptionalReleaseType(value))
	@IsOptional()
	@IsIn(['audio', 'video'])
	releaseType?: 'audio' | 'video';

	@ApiPropertyOptional({ example: 'wmg_report' })
	@IsOptional()
	@IsString()
	importSource?: string;
}

export class DashboardAnalyticsQueryDto extends EntityTimelineQueryDto {
	@IsNotEmpty()
	@IsEnum(['stream', 'revenue'])
	@ApiProperty({
		description: 'Type of metric: stream (quantity) or revenue (USD)',
		enum: ['stream', 'revenue'],
		example: 'stream',
	})
	type: 'stream' | 'revenue';
}

/**
 * DTO cho entity top-releases (channel).
 */
export class EntityRankingQueryDto extends ChartQueryDto {
	@ApiPropertyOptional({
		description: 'Sort order: views (default), usage quantity, or revenue',
		enum: ['views', 'usage', 'revenue'],
		default: 'views',
	})
	@IsOptional()
	@IsIn(['views', 'usage', 'revenue'])
	sortBy?: 'views' | 'usage' | 'revenue';

	@ApiPropertyOptional({ description: 'Page number', minimum: 1, default: 1 })
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	page?: number;

	@ApiPropertyOptional({
		description: 'Items per page',
		minimum: 1,
		maximum: 100,
		default: 20,
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(100)
	pageSize?: number;

	@ApiPropertyOptional({
		description:
			'Limit results to top N items. When set, overrides pageSize for /dsp and /ter endpoints. Combine with includeOther to aggregate the rest.',
		minimum: 1,
		maximum: 100,
		example: 5,
	})
	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(100)
	topN?: number;

	@ApiPropertyOptional({
		description:
			'When true, appends an aggregated "Other" item that sums all entries beyond the top N.',
		default: false,
		example: true,
	})
	@IsOptional()
	@Type(() => Boolean)
	@IsBoolean()
	includeOther?: boolean;

	get limit(): number {
		return this.pageSize ?? 20;
	}
	get skip(): number {
		return ((this.page ?? 1) - 1) * this.limit;
	}
}
