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
