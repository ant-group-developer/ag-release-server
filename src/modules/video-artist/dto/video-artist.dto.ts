import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	ArrayMinSize,
	IsArray,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	Length,
	ValidateIf,
	ValidateNested,
} from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/common.base-query.dto';

export class CreateVideoArtistDto {
	@IsNotEmpty()
	@IsString()
	@Length(10, 10)
	artistId: string;

	@IsNotEmpty()
	@IsUUID()
	videoId: string;
}

export class BulkCreateVideoArtistDto {
	@IsArray()
	@ArrayMinSize(1)
	@ValidateNested({ each: true })
	@Type(() => CreateVideoArtistDto)
	items: CreateVideoArtistDto[];
}

export class UpdateVideoArtistDto extends PartialType(CreateVideoArtistDto) {
	@IsNotEmpty()
	@Length(10, 10)
	@ValidateIf((_, value) => value !== undefined)
	artistId: string;

	@IsNotEmpty()
	@IsUUID()
	@ValidateIf((_, value) => value !== undefined)
	videoId: string;
}

export class QueryGetListVideoArtistDto extends BaseQueryDto {
	@IsUUID()
	@IsOptional()
	videoId?: string;
}
