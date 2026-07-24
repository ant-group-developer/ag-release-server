import {
	IsBoolean,
	IsEnum,
	IsNumber,
	IsOptional,
	IsString,
	ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { BaseQueryDto } from 'src/common/dtos/common.base-query.dto';

import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsNotEmpty, MaxLength } from 'class-validator';
import { DEFAULT_LENGTH_NAME } from 'src/common/constants/common.default.constants';
import { FieldOrderCountry } from '../enum/country.enum';

export class CreateCountryDto {
	@ApiProperty({
		description: 'The name of the country',
		maxLength: 100,
		example: 'Vietnam',
	})
	@IsString()
	@IsNotEmpty()
	@MaxLength(DEFAULT_LENGTH_NAME)
	name: string;

	@ApiProperty({
		description: 'The ISO 3166-1 alpha-3 code',
		maxLength: 10,
		example: 'VNM',
	})
	@IsString()
	@IsNotEmpty()
	@MaxLength(10)
	iso3: string;

	@ApiProperty({
		description: 'The ISO 3166-1 alpha-2 code',
		maxLength: 10,
		example: 'VN',
	})
	@IsString()
	@IsNotEmpty()
	@MaxLength(10)
	iso2: string;

	@ApiProperty({
		description: 'The numeric code for the country',
		maxLength: 10,
		example: '704',
	})
	@IsString()
	@IsNotEmpty()
	@MaxLength(10)
	numericCode: string;

	@ApiProperty({
		description: 'The phone code for the country',
		maxLength: 10,
		example: '+84',
	})
	@IsString()
	@IsNotEmpty()
	@MaxLength(10)
	phoneCode: string;

	@ApiProperty({
		description: 'The capital of the country',
		maxLength: 30,
		example: 'Hanoi',
	})
	@IsString()
	@IsNotEmpty()
	@MaxLength(30)
	capital: string;

	@ApiProperty({
		description: 'The currency code for the country',
		maxLength: 10,
		example: 'VND',
	})
	@IsString()
	@IsNotEmpty()
	@MaxLength(10)
	currency: string;

	@ApiProperty({
		description: 'The full name of the currency',
		maxLength: 30,
		example: 'Vietnamese Dong',
	})
	@IsString()
	@IsNotEmpty()
	@MaxLength(30)
	currencyName: string;

	@ApiProperty({
		description: 'The symbol of the currency',
		maxLength: 10,
		example: '₫',
	})
	@IsString()
	@IsNotEmpty()
	@MaxLength(10)
	currencySymbol: string;

	@ApiProperty({
		description: 'The region ID to which the country belongs',
		example: 1,
	})
	@IsNumber()
	@IsNotEmpty()
	regionId: number;

	@ApiProperty({
		description: 'The nationality of the country',
		maxLength: 30,
		example: 'Vietnamese',
	})
	@IsString()
	@IsNotEmpty()
	@MaxLength(30)
	nationality: string;

	@IsString()
	@IsNotEmpty()
	@MaxLength(30)
	continent: string;
}

export class UpdateCountryDto extends PartialType(CreateCountryDto) {
	@IsString()
	@IsNotEmpty()
	@MaxLength(DEFAULT_LENGTH_NAME)
	@ValidateIf((_, value) => value !== undefined)
	name?: string;

	@IsString()
	@IsNotEmpty()
	@MaxLength(10)
	@ValidateIf((_, value) => value !== undefined)
	iso3?: string;

	@IsString()
	@IsNotEmpty()
	@MaxLength(10)
	@ValidateIf((_, value) => value !== undefined)
	iso2?: string;

	@IsString()
	@IsNotEmpty()
	@MaxLength(10)
	@ValidateIf((_, value) => value !== undefined)
	numericCode?: string;

	@IsString()
	@IsNotEmpty()
	@MaxLength(10)
	@ValidateIf((_, value) => value !== undefined)
	phoneCode?: string;

	@IsString()
	@IsNotEmpty()
	@MaxLength(30)
	@ValidateIf((_, value) => value !== undefined)
	capital?: string;

	@IsString()
	@IsNotEmpty()
	@MaxLength(10)
	@ValidateIf((_, value) => value !== undefined)
	currency?: string;

	@IsString()
	@IsNotEmpty()
	@MaxLength(30)
	@ValidateIf((_, value) => value !== undefined)
	currencyName?: string;

	@IsString()
	@IsNotEmpty()
	@MaxLength(10)
	@ValidateIf((_, value) => value !== undefined)
	currencySymbol?: string;

	@IsNumber()
	@IsNotEmpty()
	@ValidateIf((_, value) => value !== undefined)
	regionId?: number;

	@IsString()
	@IsNotEmpty()
	@MaxLength(30)
	@ValidateIf((_, value) => value !== undefined)
	nationality?: string;

	@IsString()
	@IsNotEmpty()
	@MaxLength(30)
	@ValidateIf((_, value) => value !== undefined)
	continent?: string;
}

export class QueryGetListCountryDto extends BaseQueryDto {
	@IsOptional()
	@IsEnum(FieldOrderCountry)
	fieldOrder: FieldOrderCountry = FieldOrderCountry.NAME;
}

export class SyncCountryFlagsDto {
	@IsOptional()
	@IsBoolean()
	@Transform(({ value }) => value === true || value === 'true')
	force?: boolean = false;
}
