// src/modules/aggregators/dto/create-aggregator.dto.ts
import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	IsBoolean,
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsString,
	MaxLength,
	ValidateNested,
} from 'class-validator';
import {
	DEFAULT_LENGTH_CODE,
	DEFAULT_LENGTH_NAME,
} from 'src/common/constants/common.default.constants';
import { BaseQueryDto2 } from 'src/common/dtos/common.base-query.dto';
import { OrderDirection } from 'src/common/enums/common';
import { CreateSftpConfigDto } from '../../sftp-configs/dto/sftp-config.dto';
import { FieldOrderAggregator } from '../enum/distribution.enum';

export class CreateAggregatorDto {
	@IsString()
	@IsNotEmpty()
	@MaxLength(DEFAULT_LENGTH_NAME)
	name: string;

	@IsString()
	@IsNotEmpty()
	@MaxLength(DEFAULT_LENGTH_CODE)
	code: string;

	@IsOptional()
	@ValidateNested()
	@Type(() => CreateSftpConfigDto)
	sftpConfig?: CreateSftpConfigDto;

	@ApiPropertyOptional({
		type: 'boolean',
		default: false,
	})
	@IsBoolean()
	@IsOptional()
	isDefault?: boolean;

	@ApiPropertyOptional({
		type: 'boolean',
		default: true,
	})
	@IsBoolean()
	@IsOptional()
	isActive?: boolean;

	@IsOptional()
	@IsString()
	@MaxLength(DEFAULT_LENGTH_NAME)
	ddexId?: string | null;

	@IsOptional()
	@IsString()
	@MaxLength(DEFAULT_LENGTH_NAME)
	ddexName?: string | null;

	@IsOptional()
	createsDoneFolder?: boolean;
}

export class UpdateAggregatorDto extends PartialType(CreateAggregatorDto) {}

export class GetListAggregatorDto extends BaseQueryDto2 {
	@IsOptional()
	@IsEnum(FieldOrderAggregator)
	fieldOrder: FieldOrderAggregator = FieldOrderAggregator.name;

	@IsOptional()
	orderBy: OrderDirection = OrderDirection.ASC;
}
