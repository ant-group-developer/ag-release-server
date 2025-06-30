import { PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';

export class CreateDspDto {
	@IsString()
	name: string;

	@IsOptional()
	@IsString()
	picture: string | null;

	@IsBoolean()
	canLinkArtistProfile: boolean;
}

export class UpdateDspDto extends PartialType(CreateDspDto) {}

export class QueryGetListDspDto extends BaseQueryDto {}
