import {
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsString,
	MaxLength,
} from 'class-validator';
import {
	DEFAULT_LENGTH_CODE,
	DEFAULT_LENGTH_NAME,
} from 'src/common/constants/common.default.constants';
import { BaseQueryDto } from 'src/common/dtos/common.base-query.dto';
import { LENGTH_PICTURE } from 'src/modules/database/constants/database.constants';
import { FieldOrderTrackSensitive } from '../enum/track-sensitive.enum';

export class CreateTrackSensitiveDto {
	@IsString()
	@IsNotEmpty()
	@MaxLength(DEFAULT_LENGTH_NAME)
	name: string;

	@IsString()
	@IsNotEmpty()
	@MaxLength(DEFAULT_LENGTH_CODE)
	code: string;

	@IsOptional()
	@IsString()
	icon?: string | null;
}

export class UpdateTrackSensitiveDto {
	@IsOptional()
	@IsString()
	@MaxLength(DEFAULT_LENGTH_NAME)
	name?: string;

	@IsOptional()
	@IsString()
	@MaxLength(DEFAULT_LENGTH_CODE)
	code?: string;

	@IsOptional()
	@IsString()
	@MaxLength(LENGTH_PICTURE)
	icon?: string | null;
}

export class QueryGetListTrackSensitiveDto extends BaseQueryDto {
	@IsOptional()
	@IsString()
	keyword?: string;

	@IsOptional()
	@IsEnum(FieldOrderTrackSensitive)
	order?: FieldOrderTrackSensitive;
}
