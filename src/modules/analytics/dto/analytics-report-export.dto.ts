import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';

export type SplitMode =
  | 'none'
  | 'by_workspace'
  | 'by_artist'
  | 'by_period'
  | 'workspace_artist'
  | 'workspace_period';

export type SplitPeriodUnit = 'month' | 'quarter';

export class AnalyticsReportExportDto {
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
      'Chế độ chia file xuất. ' +
      '"none" = 1 file duy nhất (mặc định). ' +
      '"by_workspace" = mỗi workspace 1 file → ZIP. ' +
      '"by_artist" = mỗi artist 1 file → ZIP. ' +
      '"by_period" = mỗi tháng/quý 1 file → ZIP (dùng splitPeriodUnit). ' +
      '"workspace_artist" = thư mục workspace chứa file theo artist → ZIP. ' +
      '"workspace_period" = thư mục workspace chứa file theo period → ZIP.',
    enum: [
      'none',
      'by_workspace',
      'by_artist',
      'by_period',
      'workspace_artist',
      'workspace_period',
    ],
    default: 'none',
  })
  @IsOptional()
  @IsIn([
    'none',
    'by_workspace',
    'by_artist',
    'by_period',
    'workspace_artist',
    'workspace_period',
  ])
  splitMode?: SplitMode = 'none';

  @ApiPropertyOptional({
    description:
      'Đơn vị chu kỳ chia file. Chỉ dùng khi splitMode = "by_period" hoặc "workspace_period". ' +
      '"month" = mỗi tháng 1 file. "quarter" = mỗi quý 1 file. Mặc định: "month".',
    enum: ['month', 'quarter'],
    default: 'month',
  })
  @IsOptional()
  @IsIn(['month', 'quarter'])
  splitPeriodUnit?: SplitPeriodUnit = 'month';
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
