import { PartialType } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';

export class CreateArtistDto {
	@IsString()
	name: string;

	@IsOptional()
	@IsString()
	picture: string | null;

	@IsOptional()
	@IsString()
	biography: string | null;
}

export class UpdateArtistDto extends PartialType(CreateArtistDto) {}

export class QueryGetListArtistDto extends BaseQueryDto {}
