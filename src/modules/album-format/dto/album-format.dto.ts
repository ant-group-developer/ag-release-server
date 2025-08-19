import { PartialType } from '@nestjs/swagger';
import {
	IsEnum,
	IsInt,
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
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';
import { FieldOrderAlbumFormat } from '../enums/album-format.enum';

export class CreateAlbumFormatDto {
	@IsString()
	@MaxLength(DEFAULT_LENGTH_NAME)
	@IsNotEmpty()
	name: string;

	@IsString()
	@MaxLength(DEFAULT_LENGTH_CODE)
	@IsNotEmpty()
	code: string;

	@IsInt()
	@IsNotEmpty()
	minTrackCount: number;

	@IsInt()
	@IsNotEmpty()
	maxTrackCount: number;
}

export class UpdateAlbumFormatDto extends PartialType(CreateAlbumFormatDto) {
	@IsNotEmpty()
	@IsString()
	@MaxLength(DEFAULT_LENGTH_NAME)
	@ValidateIf((_, value) => value !== undefined)
	name: string;

	@ValidateIf((_, value) => value !== undefined)
	@IsString()
	@MaxLength(DEFAULT_LENGTH_CODE)
	code: string;
}

export class QueryGetListAlbumFormatDto extends BaseQueryDto {
	@IsOptional()
	@IsEnum(FieldOrderAlbumFormat)
	fieldOrder: FieldOrderAlbumFormat = FieldOrderAlbumFormat.NAME;
}
