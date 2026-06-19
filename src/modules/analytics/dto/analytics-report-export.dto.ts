import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

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
}
