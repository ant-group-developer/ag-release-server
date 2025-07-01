import { PartialType } from '@nestjs/swagger';
import {
	IsBoolean,
	IsNotEmpty,
	IsOptional,
	IsString,
	MaxLength,
	ValidateIf,
} from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';

export class CreateDspDto {
	@IsString()
	@MaxLength(100)
	@IsNotEmpty()
	name: string;

	@IsOptional()
	@IsString()
	@MaxLength(100)
	picture: string | null;

	@IsBoolean()
	canLinkArtistProfile: boolean;
}

export class UpdateDspDto extends PartialType(CreateDspDto) {
	@ValidateIf((_, value) => value !== undefined)
	@IsString()
	@MaxLength(100)
	@IsNotEmpty()
	name: string;
}

export class QueryGetListDspDto extends BaseQueryDto {}
