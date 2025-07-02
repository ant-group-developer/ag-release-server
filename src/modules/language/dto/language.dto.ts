import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsString,
	MaxLength,
	ValidateIf,
} from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';
import { FieldOrderLanguage } from '../enum/language.enum';

export class CreateLanguageDto {
	@ApiProperty({
		description: 'Name of the language',
		example: 'English',
		maxLength: 100,
	})
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	name: string;

	@ApiProperty({
		description: 'Code of the language (e.g., ISO code)',
		example: 'en',
		maxLength: 10,
	})
	@IsString()
	@IsNotEmpty()
	@MaxLength(10)
	code: string;
}

export class UpdateLanguageDto extends PartialType(CreateLanguageDto) {
	@ValidateIf((_, value) => value !== undefined)
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	name: string;

	@ValidateIf((_, value) => value !== undefined)
	@IsString()
	@IsNotEmpty()
	@MaxLength(10)
	code: string;
}

export class QueryGetListLanguageDto extends BaseQueryDto {
	@IsOptional()
	@IsEnum(FieldOrderLanguage)
	fieldOrder: FieldOrderLanguage = FieldOrderLanguage.NAME;
}
