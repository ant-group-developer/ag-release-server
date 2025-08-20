import { PartialType } from '@nestjs/swagger';
import {
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsString,
	MaxLength,
	ValidateIf,
} from 'class-validator';
import { DEFAULT_LENGTH_NAME } from 'src/common/constants/common.default.constants';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';
import { FieldTimezoneArtist } from '../enum/timezone.enum';

export class CreateTimezoneDto {
	@IsNotEmpty()
	@IsString()
	@MaxLength(DEFAULT_LENGTH_NAME)
	name: string;

	@IsNotEmpty()
	@IsString()
	@MaxLength(10)
	utc: string;

	@IsNotEmpty()
	@IsString()
	@MaxLength(100)
	zone: string;
}
export class UpdateTimezoneDto extends PartialType(CreateTimezoneDto) {
	@ValidateIf((_, value) => value !== undefined)
	@IsNotEmpty()
	@IsString()
	@MaxLength(DEFAULT_LENGTH_NAME)
	name?: string;

	@ValidateIf((_, value) => value !== undefined)
	@IsNotEmpty()
	@IsString()
	@MaxLength(10)
	utc?: string;

	@ValidateIf((_, value) => value !== undefined)
	@IsNotEmpty()
	@IsString()
	@MaxLength(100)
	zone?: string;
}

export class QueryGetListTimezoneDto extends BaseQueryDto {
	@IsOptional()
	@IsString()
	name?: string;

	@IsOptional()
	@IsString()
	utc?: string;

	@IsString()
	@IsOptional()
	zone?: string;

	@IsOptional()
	@IsEnum(FieldTimezoneArtist)
	fieldOrder: FieldTimezoneArtist = FieldTimezoneArtist.NAME;
}
