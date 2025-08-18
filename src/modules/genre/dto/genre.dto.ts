import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsString,
	MaxLength,
	ValidateIf,
} from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';
import { LENGTH_PICTURE } from 'src/modules/database/constants/database.constants';
import { FieldOrderGenre } from '../enum/genre.enum';

export class CreateGenreDto {
	@IsNotEmpty()
	@IsString()
	@MaxLength(100)
	name: string;

	@IsNotEmpty()
	@IsString()
	@MaxLength(50)
	code: string;

	@ApiPropertyOptional({
		description: 'The picture associated with the genre, can be null',
		example: 'rock_picture.jpg',
		maxLength: LENGTH_PICTURE,
	})
	@IsOptional()
	@IsString()
	@MaxLength(LENGTH_PICTURE)
	picture: string | null;

	@ApiPropertyOptional({
		description: 'A brief description of the genre, can be null',
		example:
			'A genre of music characterized by a strong rhythm and often played with electric guitars.',
	})
	@IsOptional()
	@IsString()
	@MaxLength(200)
	description: string | null;
}

export class UpdateGenreDto extends PartialType(CreateGenreDto) {
	@IsNotEmpty()
	@IsString()
	@MaxLength(100)
	@ValidateIf((_, value) => value !== undefined)
	name: string;

	@IsNotEmpty()
	@ValidateIf((_, value) => value !== undefined)
	@IsString()
	@MaxLength(50)
	code: string;
}

export class QueryGetListGenreDto extends BaseQueryDto {
	@IsOptional()
	@IsEnum(FieldOrderGenre)
	fieldOrder: FieldOrderGenre = FieldOrderGenre.NAME;
}
