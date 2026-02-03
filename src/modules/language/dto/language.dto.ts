import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsString,
	MaxLength,
	ValidateIf,
} from 'class-validator';
import {
	DEFAULT_LENGTH_CODE,
	DEFAULT_LENGTH_NAME,
} from 'src/common/constants/common.default.constants';
import { BaseQueryDto } from 'src/common/dtos/common.base-query.dto';
import { FieldOrderLanguage } from '../enum/language.enum';

export class CreateLanguageDto {
	@ApiProperty({
		description: 'Name of the language',
		example: 'English',
		maxLength: DEFAULT_LENGTH_NAME,
	})
	@IsString()
	@IsNotEmpty()
	@MaxLength(DEFAULT_LENGTH_NAME)
	name: string;

	@ApiProperty({
		description: 'Code of the language (e.g., ISO code)',
		example: 'en',
		maxLength: DEFAULT_LENGTH_CODE,
	})
	@IsString()
	@IsNotEmpty()
	@MaxLength(DEFAULT_LENGTH_CODE)
	code: string;
}

export class UpdateLanguageDto extends PartialType(CreateLanguageDto) {
	@ValidateIf((_, value) => value !== undefined)
	@IsString()
	@IsNotEmpty()
	@MaxLength(DEFAULT_LENGTH_NAME)
	name: string;

	@ValidateIf((_, value) => value !== undefined)
	@IsString()
	@IsNotEmpty()
	@MaxLength(DEFAULT_LENGTH_CODE)
	code: string;
}

export class QueryGetListLanguageDto extends BaseQueryDto {
	@IsOptional()
	@IsEnum(FieldOrderLanguage)
	fieldOrder: FieldOrderLanguage = FieldOrderLanguage.NAME;
}
