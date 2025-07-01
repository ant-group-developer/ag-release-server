import { PartialType } from '@nestjs/swagger';
import {
	IsNotEmpty,
	IsString,
	IsUUID,
	Length,
	ValidateIf,
} from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';

export class CreateReleaseArtistDto {
	@IsNotEmpty()
	@IsUUID()
	artistRoleId: string;

	@IsNotEmpty()
	@IsString()
	@Length(10)
	artistId: string;

	@IsNotEmpty()
	@IsUUID()
	releaseId: string;
}

export class UpdateReleaseArtistDto extends PartialType(
	CreateReleaseArtistDto,
) {
	@IsNotEmpty()
	@IsUUID()
	@ValidateIf((_, value) => value !== undefined)
	artistRoleId: string;

	@IsNotEmpty()
	@IsUUID()
	@ValidateIf((_, value) => value !== undefined)
	artistId: string;

	@IsNotEmpty()
	@IsUUID()
	@ValidateIf((_, value) => value !== undefined)
	releaseId: string;
}

export class QueryGetListReleaseArtistDto extends BaseQueryDto {}
