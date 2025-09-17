import { PartialType } from '@nestjs/swagger';
import {
	IsEnum,
	IsInt,
	IsNotEmpty,
	IsOptional,
	IsString,
	MaxLength,
} from 'class-validator';
import {
	DEFAULT_LENGTH_CODE,
	DEFAULT_LENGTH_NAME,
} from 'src/common/constants/common.default.constants';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';
import { FieldOrderTenantTier } from '../enum/tenant-tier.enum';

export class CreateTenantTierDto {
	@IsString()
	@MaxLength(DEFAULT_LENGTH_NAME)
	@IsNotEmpty()
	nameVi: string;

	@IsString()
	@MaxLength(DEFAULT_LENGTH_NAME)
	@IsNotEmpty()
	nameEn: string;

	@IsString()
	@MaxLength(DEFAULT_LENGTH_CODE)
	@IsNotEmpty()
	code: string;

	@IsInt()
	@IsOptional()
	minScore?: number;

	@IsInt()
	@IsOptional()
	maxScore?: number;

	@IsString()
	@IsOptional()
	description?: string;

	@IsString()
	@IsOptional()
	note?: string;
}

export class UpdateTenantTierDto extends PartialType(CreateTenantTierDto) {}

export class QueryGetListTenantTierDto extends BaseQueryDto {
	@IsEnum(FieldOrderTenantTier)
	@IsOptional()
	fieldOrder: FieldOrderTenantTier = FieldOrderTenantTier.NAME_EN;
}
