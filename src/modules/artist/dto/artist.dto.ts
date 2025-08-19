import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
	IsArray,
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	Length,
	MaxLength,
	ValidateIf,
	ValidateNested,
} from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';

import { Type } from 'class-transformer';
import { DEFAULT_LENGTH_NAME } from 'src/common/constants/common.default.constants';
import { LENGTH_PICTURE } from 'src/modules/database/constants/database.constants';
import { FieldOrderArtist } from '../enum/artist.enum';

class CreateArtistProfileDto {
	@IsNotEmpty()
	@MaxLength(50)
	name: string;

	@IsNotEmpty()
	@MaxLength(100)
	url: string;

	@IsNotEmpty()
	@Length(10, 10)
	dspId: string;
}

export class CreateArtistDto {
	@ApiProperty({
		description: 'Name of the artist',
		maxLength: 100,
		example: 'John Doe',
	})
	@IsString()
	@MaxLength(DEFAULT_LENGTH_NAME)
	@IsNotEmpty()
	name: string;

	@ApiProperty({
		description: 'Picture of the artist',
		maxLength: LENGTH_PICTURE,
		required: false,
		type: 'string',
		example: 'http://example.com/picture.jpg',
	})
	@IsOptional()
	@MaxLength(LENGTH_PICTURE)
	@IsString()
	picture: string | null;

	@ApiProperty({
		description: 'Biography of the artist',
		maxLength: 250,
		required: false,
		type: 'string',
		example: 'John Doe is a famous artist known for his unique style...',
	})
	@IsOptional()
	@IsString()
	@MaxLength(250)
	biography: string | null;

	@IsOptional()
	@ValidateNested({ each: true })
	@Type(() => CreateArtistProfileDto)
	@IsArray()
	artistProfiles?: CreateArtistProfileDto[];
}

class UpdateArtistProfileDto {
	@IsUUID()
	@IsOptional()
	id?: string;

	@IsNotEmpty()
	@MaxLength(50)
	name: string;

	@IsNotEmpty()
	@MaxLength(100)
	url: string;

	@IsNotEmpty()
	@Length(10, 10)
	dspId: string;
}

export class UpdateArtistDto extends PartialType(CreateArtistDto) {
	@IsString()
	@MaxLength(DEFAULT_LENGTH_NAME)
	@IsNotEmpty()
	@ValidateIf((_, value) => value !== undefined)
	name: string;

	@IsOptional()
	@ValidateNested({ each: true })
	@Type(() => UpdateArtistProfileDto)
	@IsArray()
	artistProfiles?: UpdateArtistProfileDto[];
}

export class QueryGetListArtistDto extends BaseQueryDto {
	@IsOptional()
	@IsEnum(FieldOrderArtist)
	fieldOrder: FieldOrderArtist = FieldOrderArtist.NAME;

	@IsOptional()
	id: string;
}
