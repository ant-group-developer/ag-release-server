import { PartialType } from '@nestjs/swagger';
import {
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsString,
	MaxLength,
	ValidateIf,
} from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';
import { FieldOrderArtistRole } from '../enum/artist-role.enum';
import { DEFAULT_LENGTH_CODE, DEFAULT_LENGTH_NAME } from 'src/common/constants/common.default.constants';

export class CreateArtistRoleDto {
	@IsNotEmpty()
	@IsString()
	@MaxLength(DEFAULT_LENGTH_NAME)
	name: string;

	@IsNotEmpty()
	@IsString()
	@MaxLength(DEFAULT_LENGTH_CODE)
	code: string;
}

export class UpdateArtistRoleDto extends PartialType(CreateArtistRoleDto) {
	@IsNotEmpty()
	@IsString()
	@MaxLength(DEFAULT_LENGTH_NAME)
	@ValidateIf((_, value) => value !== undefined)
	name: string;

	@ValidateIf((_, value) => value !== undefined)
	@IsString()
	@MaxLength(DEFAULT_LENGTH_CODE)
	code: string;
}

export class QueryGetListArtistRoleDto extends BaseQueryDto {
	@IsOptional()
	@IsEnum(FieldOrderArtistRole)
	fieldOrder: FieldOrderArtistRole = FieldOrderArtistRole.NAME;
}
