import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';

export class CreateGenreDto {
	@ApiProperty({
		description: 'The name of the genre',
		example: 'Rock',
	})
	@IsString()
	@MaxLength(100)
	name: string;

	@ApiPropertyOptional({
		description: 'The picture associated with the genre, can be null',
		example: 'rock_picture.jpg',
	})
	@IsOptional()
	@IsString()
	@MaxLength(100)
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
	@IsString()
	@MaxLength(100)
	@ValidateIf((_, value) => value !== undefined)
	name: string;
}

export class QueryGetListGenreDto extends BaseQueryDto {}
