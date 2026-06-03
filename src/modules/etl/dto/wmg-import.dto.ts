import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class WmgImportDto {
  @ApiPropertyOptional({ default: 'VND', description: 'Revenue currency code' })
  @IsOptional()
  @IsString()
  revenueCurrency?: string;

  @ApiPropertyOptional({ default: 'AMG GROUP', description: 'Default member/payee name if empty in file' })
  @IsOptional()
  @IsString()
  memberName?: string;

  @ApiPropertyOptional({ default: 'wmg_report', description: 'Source label for dsps_report records' })
  @IsOptional()
  @IsString()
  source?: string;
}
