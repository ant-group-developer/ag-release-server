import { PartialType } from '@nestjs/swagger';
import {
	IsBoolean,
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
import { FieldOrderTrackOriginType } from '../enum/track-origin-type.enum';

export class CreateTrackOriginTypeDto {
	@IsNotEmpty()
	@IsString()
	@MaxLength(DEFAULT_LENGTH_NAME)
	name: string;

	@IsNotEmpty()
	@IsString()
	@MaxLength(DEFAULT_LENGTH_CODE)
	code: string;

	@ValidateIf((_, value) => value !== undefined)
	@IsBoolean()
	isDefault?: boolean;
}

export class UpdateTrackOriginTypeDto extends PartialType(
	CreateTrackOriginTypeDto,
) {
	@IsString()
	@IsNotEmpty()
	@MaxLength(DEFAULT_LENGTH_NAME)
	@ValidateIf((_, value) => value !== undefined)
	name: string;

	@ValidateIf((_, value) => value !== undefined)
	@IsNotEmpty()
	@IsString()
	@MaxLength(DEFAULT_LENGTH_CODE)
	code: string;

	@ValidateIf((_, value) => value !== undefined)
	@IsBoolean()
	isDefault?: boolean;
}

export class QueryGetListTrackOriginTypeDto extends BaseQueryDto {
	@IsOptional()
	@IsEnum(FieldOrderTrackOriginType)
	fieldOrder: FieldOrderTrackOriginType = FieldOrderTrackOriginType.NAME;
}
