import { Type } from 'class-transformer';
import {
	IsBoolean,
	IsEnum,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsString,
	IsUUID,
	MaxLength,
	Min,
	ValidateIf,
} from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/common.base-query.dto';
import { FieldOrderCurrency } from '../enum/price-tier.enum';

export class CreatePriceTierDto {
	@Type(() => Number)
	@IsNotEmpty()
	@IsNumber()
	@Min(0)
	amount: number;

	@IsString()
	@IsNotEmpty()
	@MaxLength(50)
	code: string;

	@IsUUID()
	@IsNotEmpty()
	currencyId: string;

	@ValidateIf((_, value) => value !== undefined)
	@IsNotEmpty()
	@IsBoolean()
	isDefault: boolean = false;

	@ValidateIf((_, value) => value !== undefined)
	@IsNotEmpty()
	@IsBoolean()
	isActive: boolean = true;
}

export class UpdatePriceTierDto {
	@ValidateIf((_, value) => value !== undefined)
	@Type(() => Number)
	@IsNotEmpty()
	@IsNumber()
	@Min(0)
	amount?: number;

	@IsString()
	@IsNotEmpty()
	@MaxLength(50)
	@IsOptional()
	code?: string;

	@ValidateIf((_, value) => value !== undefined)
	@IsUUID()
	@IsNotEmpty()
	currencyId?: string;

	@ValidateIf((_, value) => value !== undefined)
	@IsNotEmpty()
	@IsBoolean()
	isDefault?: boolean;

	@ValidateIf((_, value) => value !== undefined)
	@IsNotEmpty()
	@IsBoolean()
	isActive?: boolean;
}

export class QueryGetListPriceTier extends BaseQueryDto {
	@IsEnum(FieldOrderCurrency)
	fieldOrder: FieldOrderCurrency = FieldOrderCurrency.CREATED_AT;
}
