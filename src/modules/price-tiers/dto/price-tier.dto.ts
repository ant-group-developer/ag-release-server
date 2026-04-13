import { Type } from 'class-transformer';
import {
	ArrayMinSize,
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
	ValidateNested,
} from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/common.base-query.dto';
import { FieldOrderCurrency, PriceTierType } from '../enum/price-tier.enum';

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

	@ValidateIf((_, value) => value !== undefined)
	@Type(() => Number)
	@IsNumber()
	@Min(0)
	order?: number;

	@ValidateIf((_, value) => value !== undefined)
	@IsString()
	@MaxLength(200)
	ciCode?: string;

	@ValidateIf((_, value) => value !== undefined)
	@IsEnum(PriceTierType)
	type?: PriceTierType;
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

	@ValidateIf((_, value) => value !== undefined)
	@Type(() => Number)
	@IsNumber()
	@Min(0)
	order?: number;

	@ValidateIf((_, value) => value !== undefined)
	@IsString()
	@MaxLength(200)
	ciCode?: string;

	@ValidateIf((_, value) => value !== undefined)
	@IsEnum(PriceTierType)
	type?: PriceTierType;
}

export class QueryGetListPriceTier extends BaseQueryDto {
	@IsEnum(FieldOrderCurrency)
	fieldOrder: FieldOrderCurrency = FieldOrderCurrency.CREATED_AT;

	@IsOptional()
	@IsEnum(PriceTierType)
	type?: PriceTierType;
}

export class BulkUpdateItemDto extends UpdatePriceTierDto {
	@IsUUID()
	@IsNotEmpty()
	id: string;
}

export class BulkUpdatePriceTierDto {
	@IsNotEmpty()
	@ArrayMinSize(1)
	@ValidateNested({ each: true })
	@Type(() => BulkUpdateItemDto)
	priceTiers: BulkUpdateItemDto[];
}
