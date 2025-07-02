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
import { lengthPicture } from 'src/modules/database/constants/database.constant';
import { FieldOrderArtist } from '../enum/artist.enum';

export class CreateArtistDto {
	@ApiProperty({
		description: 'Name of the artist',
		maxLength: 100,
		example: 'John Doe',
	})
	@IsString()
	@MaxLength(100)
	@IsNotEmpty()
	name: string;

	@ApiProperty({
		description: 'Picture of the artist',
		maxLength: lengthPicture,
		required: false,
		type: 'string',
		example: 'http://example.com/picture.jpg',
	})
	@IsOptional()
	@MaxLength(lengthPicture)
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
}

export class UpdateArtistDto extends PartialType(CreateArtistDto) {
	@IsString()
	@MaxLength(100)
	@IsNotEmpty()
	@ValidateIf((_, value) => value !== undefined)
	name: string;
}

export class QueryGetListArtistDto extends BaseQueryDto {
	@IsOptional()
	@IsEnum(FieldOrderArtist)
	fieldOrder: FieldOrderArtist = FieldOrderArtist.NAME;

	@IsOptional()
	id: string;
}
