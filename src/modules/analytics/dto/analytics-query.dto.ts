import {
  IsDateString,
  IsIn,
  IsInt,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  Max,
  IsEnum,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseQueryDto } from 'src/common/dtos/common.base-query.dto';

/**
 * Base DTO cho tất cả analytics queries.
 * Extends BaseQueryDto để dùng chung page/pageSize pagination.
 * Thêm fromDate/toDate bắt buộc cho analytics.
 */
export abstract class BaseAnalyticsQueryDto extends BaseQueryDto {
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
    description: 'Filter ranking to specific DSP ID (e.g. spotify, apple_music)',
    example: 'spotify',
  })
  @IsOptional()
  @IsString()
  dspId?: string;

  @ApiPropertyOptional({
    description: 'Filter by release type: audio or video. Omit to include both.',
    enum: ['audio', 'video'],
    example: 'audio',
  })
  @IsOptional()
  @IsIn(['audio', 'video'])
  releaseType?: 'audio' | 'video';

  @ApiPropertyOptional({
    description:
      'Filter by import source. Known values: ftp (Merlin), wmg_report (WMG), spotify_report (Spotify). Extensible — pass any raw source value.',
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
    description:
      'Whether to group non-top items into an "Other" category',
    default: true,
    example: true,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeOther?: boolean;

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
export class RankingQueryDto extends BaseAnalyticsQueryDto { }

/**
 * Base DTO cho DSP analytics. Truyền cả pgDspId + dspReportId — ưu tiên pgDspId.
 */
export class DspAnalyticsBaseDto {
  @ApiPropertyOptional({
    description: 'Postgres DSP UUID — lấy từ field pgDspId trong response ranking/revenue API. Ưu tiên hơn dspReportId.',
    format: 'uuid',
  })
  @IsOptional()
  @IsString()
  pgDspId?: string;

  @ApiPropertyOptional({
    description: 'Raw ClickHouse DSP ID (id_dsps_report) — lấy từ field dspReportId. Dùng khi pgDspId = null.',
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
    description: 'Filter by release type: audio or video. Omit to include both.',
    enum: ['audio', 'video'],
  })
  @IsOptional()
  @IsIn(['audio', 'video'])
  releaseType?: 'audio' | 'video';
}

/**
 * DTO cho DSP chart endpoints (line-chart, bar-chart).
 */
export class DspChartQueryDto extends DspOverviewQueryDto {}

/**
 * DTO cho các Chart APIs (line-chart, bar-chart).
 * Chỉ cần fromDate / toDate, không cần pagination.
 */
export class ChartQueryDto {
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
    description: 'Filter by release type: audio or video. Omit to include both.',
    enum: ['audio', 'video'],
    example: 'audio',
  })
  @IsOptional()
  @IsIn(['audio', 'video'])
  releaseType?: 'audio' | 'video';

  @ApiPropertyOptional({
    description: 'Filter by import source. Known values: ftp (Merlin), wmg_report (WMG), spotify_report (Spotify).',
    example: 'wmg_report',
  })
  @IsOptional()
  @IsString()
  importSource?: string;
}

export class EntityTimelineQueryDto {
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
  

  @IsOptional() @IsInt() @Min(1) @Max(20)
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
  

  @IsOptional() @IsBoolean()
  @ApiPropertyOptional({
    description:
      'Whether to group non-top items into an "Other" category',
    default: true,
    example: true,
  })
  @Type(() => Boolean)
  includeOther?: boolean = true;

  @ApiPropertyOptional({
    description: 'Filter by release type: audio or video. Omit to include both.',
    enum: ['audio', 'video'],
    example: 'audio',
  })
  @IsOptional()
  @IsIn(['audio', 'video'])
  releaseType?: 'audio' | 'video';

  @ApiPropertyOptional({
    description: 'Filter by import source. Known values: ftp (Merlin), wmg_report (WMG), spotify_report (Spotify).',
    example: 'wmg_report',
  })
  @IsOptional()
  @IsString()
  importSource?: string;
}

export class EntityOverviewQueryDto {
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
    description: 'Filter by release type: audio or video. Omit to include both.',
    enum: ['audio', 'video'],
    example: 'audio',
  })
  @IsOptional()
  @IsIn(['audio', 'video'])
  releaseType?: 'audio' | 'video';

  @ApiPropertyOptional({
    description: 'Filter by import source. Known values: ftp (Merlin), wmg_report (WMG), spotify_report (Spotify).',
    example: 'wmg_report',
  })
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