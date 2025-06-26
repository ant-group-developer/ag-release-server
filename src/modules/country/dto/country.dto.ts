import { PartialType } from '@nestjs/swagger';
import { IsNumber, IsString } from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';

export class CreateCountryDto {
	@IsString()
	name: string;

	@IsString()
	iso3: string;

	@IsString()
	iso2: string;

	@IsString()
	numericCode: string;

	@IsString()
	phoneCode: string;

	@IsString()
	capital: string;

	@IsString()
	currency: string;

	@IsString()
	currencyName: string;

	@IsString()
	currencySymbol: string;

	@IsNumber()
	regionId: number;

	@IsString()
	nationality: string;
}

export class UpdateCountryDto extends PartialType(CreateCountryDto) {}

export class QueryGetListCountryDto extends BaseQueryDto {}
