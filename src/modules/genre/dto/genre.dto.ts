import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';

export class CreateGenreDto {
	@ApiProperty({
		description: 'The name of the genre',
		example: 'Rock',
	})
	@IsString()
	name: string;

	@ApiPropertyOptional({
		description: 'The picture associated with the genre, can be null',
		example: 'rock_picture.jpg',
	})
	@IsOptional()
	@IsString()
	picture: string | null;

	@ApiPropertyOptional({
		description: 'A brief description of the genre, can be null',
		example:
			'A genre of music characterized by a strong rhythm and often played with electric guitars.',
	})
	@IsOptional()
	@IsString()
	description: string | null;
}

export class UpdateGenreDto extends PartialType(CreateGenreDto) {}

export class QueryGetListGenreDto extends BaseQueryDto {}
