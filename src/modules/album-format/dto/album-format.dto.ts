import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
	IsEnum,
	IsInt,
	IsNotEmpty,
	IsOptional,
	IsString,
	MaxLength,
} from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';
import { FieldOrderAlbumFormat } from '../enums/album-format.enum';

export class CreateAlbumFormatDto {
	@ApiProperty({ description: 'Name of the album format', example: 'LP' })
	@IsString()
	@MaxLength(100)
	@IsNotEmpty()
	name: string;

	@ApiProperty({ description: 'Value for the album format', example: 'lp' })
	@IsString()
	@MaxLength(50)
	@IsNotEmpty()
	value: string;

	@ApiProperty({
		description: 'Minimum track count for the album format',
		example: 1,
	})
	@IsInt()
	@IsNotEmpty()
	minTrackCount: number;

	@ApiProperty({
		description: 'Maximum track count for the album format',
		example: 15,
	})
	@IsInt()
	@IsNotEmpty()
	maxTrackCount: number;
}

export class UpdateAlbumFormatDto extends PartialType(CreateAlbumFormatDto) {}

export class QueryGetListAlbumFormatDto extends BaseQueryDto {
	@IsOptional()
	@IsEnum(FieldOrderAlbumFormat)
	fieldOrder: FieldOrderAlbumFormat = FieldOrderAlbumFormat.NAME;
}
