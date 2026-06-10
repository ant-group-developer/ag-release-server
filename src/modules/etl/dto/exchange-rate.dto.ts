import { IsOptional, IsString, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SyncExchangeRateDto {
  @ApiProperty({
    description: 'Start month (inclusive)',
    example: '2024-01',
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'fromMonth must be YYYY-MM format' })
  fromMonth: string;

  @ApiProperty({
    description: 'End month (inclusive)',
    example: '2024-12',
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'toMonth must be YYYY-MM format' })
  toMonth: string;
}

export class ListExchangeRateDto {
  @ApiPropertyOptional({
    description: 'Filter by month (YYYY-MM)',
    example: '2024-01',
  })
  @IsOptional()
  @IsString()
  month?: string;

  @ApiPropertyOptional({
    description: 'Filter by currency code',
    example: 'VND',
  })
  @IsOptional()
  @IsString()
  currency?: string;
}
