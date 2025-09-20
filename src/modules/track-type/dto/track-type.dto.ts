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
import { FieldOrderTrackType } from '../enum/track-type.enum';

export class CreateTrackTypeDto {
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

export class UpdateTrackTypeDto extends PartialType(CreateTrackTypeDto) {
	@IsNotEmpty()
	@IsString()
	@MaxLength(DEFAULT_LENGTH_NAME)
	@ValidateIf((_, value) => value !== undefined)
	name: string;

	@IsNotEmpty()
	@ValidateIf((_, value) => value !== undefined)
	@IsString()
	@MaxLength(DEFAULT_LENGTH_CODE)
	code: string;

	@ValidateIf((_, value) => value !== undefined)
	@IsBoolean()
	isDefault?: boolean;
}

export class QueryGetListTrackTypeDto extends BaseQueryDto {
	@IsOptional()
	@IsEnum(FieldOrderTrackType)
	fieldOrder: FieldOrderTrackType = FieldOrderTrackType.NAME;
}
