// src/modules/dsp-routing-configs/dto/dsp-routing-config.dto.ts
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	IsBoolean,
	IsEnum,
	IsOptional,
	IsString,
	IsUUID,
	MaxLength,
	ValidateNested,
} from 'class-validator';
import { BaseQueryDto2 } from 'src/common/dtos/common.base-query.dto';
import { CreateSftpConfigDto } from '../../sftp-configs/dto/sftp-config.dto';
import { RoutingModeEnum } from '../enum/dsp-routing.enum';

export class CreateDspRoutingConfigDto {
	@ApiProperty({ example: 'DSP_01' })
	@IsString()
	@MaxLength(10)
	dspId?: string;

	@ApiPropertyOptional({ format: 'uuid', nullable: true })
	@IsOptional()
	@IsUUID()
	aggregatorId?: string | null;

	// @ApiPropertyOptional({ format: 'uuid', nullable: true })
	// @IsOptional()
	// @IsUUID()
	// sftpConfigId?: string | null;

	@IsOptional()
	@ValidateNested()
	@Type(() => CreateSftpConfigDto)
	sftpConfig?: CreateSftpConfigDto;

	@ApiPropertyOptional({ example: true, default: true })
	@IsOptional()
	@IsBoolean()
	isActive?: boolean = true;

	@ApiProperty({ enum: RoutingModeEnum })
	@IsEnum(RoutingModeEnum)
	mode: RoutingModeEnum;
}

export class UpdateDspRoutingConfigDto extends PartialType(
	CreateDspRoutingConfigDto,
) {}

export class GetListDspRoutingConfigsDto extends BaseQueryDto2 {}
