import {
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsString,
	Length,
	ValidateIf,
} from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';
import { FieldOrderCurrency } from '../enums/currency.enum';

export class CreateCurrencyDto {
	@IsNotEmpty()
	@IsString()
	@Length(1, 100)
	name: string;

	@IsNotEmpty()
	@IsString()
	@Length(3, 3)
	code: string;
}

export class UpdateCurrencyDto {
	@ValidateIf((_, value) => value !== undefined)
	@IsNotEmpty()
	@IsString()
	@Length(1, 100)
	name?: string;

	@ValidateIf((_, value) => value !== undefined)
	@IsNotEmpty()
	@IsString()
	@Length(3, 3)
	code?: string;
}

export class QueryGetListCurrencyDto extends BaseQueryDto {
	@IsEnum(FieldOrderCurrency)
	@IsOptional()
	fieldOrder: FieldOrderCurrency = FieldOrderCurrency.NAME;
}
