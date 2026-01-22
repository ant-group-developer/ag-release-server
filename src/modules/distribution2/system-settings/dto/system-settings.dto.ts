// src/modules/distribution/system-settings/dto/system-settings.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { BaseQueryDto2 } from 'src/common/dtos/common.base-query.dto';

export class UpsertSystemSettingDto {
	@ApiProperty({ example: 'GLOBAL_DEFAULT_AGGREGATOR_ID' })
	@IsString()
	@MaxLength(100)
	key: string;

	@ApiPropertyOptional({ example: '1' })
	@IsOptional()
	@IsString()
	value?: string;

	@ApiPropertyOptional({ example: 'Default aggregator delivery_configs.id' })
	@IsOptional()
	@IsString()
	description?: string;
}

export class GetListSystemSettingsDto extends BaseQueryDto2 {
	@ApiPropertyOptional({ example: ['GLOBAL', 'AGGREGATOR'], type: [String] })
	@IsOptional()
	keyword?: string[];
}
