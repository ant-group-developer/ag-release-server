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
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';
import { FieldOrderAlbumFormat } from '../enums/album-format.enum';

export class CreateAlbumFormatDto {
	@IsString()
	@MaxLength(100)
	@IsNotEmpty()
	name: string;

	@IsString()
	@MaxLength(50)
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
	@MaxLength(100)
	@ValidateIf((_, value) => value !== undefined)
	name: string;

	@ValidateIf((_, value) => value !== undefined)
	@IsString()
	@MaxLength(50)
	code: string;
}

export class QueryGetListAlbumFormatDto extends BaseQueryDto {
	@IsOptional()
	@IsEnum(FieldOrderAlbumFormat)
	fieldOrder: FieldOrderAlbumFormat = FieldOrderAlbumFormat.NAME;
}
