import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	IsArray,
	IsNotEmpty,
	IsString,
	IsUUID,
	Length,
	ValidateIf,
	ValidateNested,
} from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/common.base-query.dto';

export class CreateVideoGenreDto {
	@ApiProperty({ format: 'uuid' })
	@IsNotEmpty()
	@IsUUID()
	videoId: string;

	@ApiProperty({ minLength: 10, maxLength: 10 })
	@IsNotEmpty()
	@IsString()
	@Length(10, 10)
	genreId: string;
}

export class UpdateVideoGenreDto extends PartialType(CreateVideoGenreDto) {
	@ApiProperty({ format: 'uuid', required: false })
	@IsNotEmpty()
	@IsUUID()
	@ValidateIf((_, value) => value !== undefined)
	videoId: string;

	@ApiProperty({ minLength: 10, maxLength: 10, required: false })
	@IsNotEmpty()
	@IsString()
	@Length(10, 10)
	@ValidateIf((_, value) => value !== undefined)
	genreId: string;
}

export class QueryGetListVideoGenreDto extends BaseQueryDto {}

export class BulkCreateVideoGenreDto {
	@ApiProperty({ type: [CreateVideoGenreDto] })
	@IsArray()
	@IsNotEmpty()
	@ValidateNested({ each: true })
	@Type(() => CreateVideoGenreDto)
	items: CreateVideoGenreDto[];
}
