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
import { FieldOrderArtistRole } from '../enum/artist-role.enum';

export class CreateArtistRoleDto {
	@ApiProperty({
		description: 'The name of the artist role',
		example: 'Composer',
		maxLength: 100,
	})
	@IsNotEmpty()
	@IsString()
	@MaxLength(100)
	name: string;
}

export class UpdateArtistRoleDto extends PartialType(CreateArtistRoleDto) {
	@IsNotEmpty()
	@IsString()
	@MaxLength(100)
	@ValidateIf((_, value) => value !== undefined)
	name: string;
}

export class QueryGetListArtistRoleDto extends BaseQueryDto {
	@IsOptional()
	@IsEnum(FieldOrderArtistRole)
	fieldOrder: FieldOrderArtistRole = FieldOrderArtistRole.NAME;
}
