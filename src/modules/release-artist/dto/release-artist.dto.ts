import { PartialType } from '@nestjs/swagger';
import {
	IsBoolean,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	Length,
	ValidateIf,
} from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/common.base-query.dto';

export class CreateReleaseArtistDto {
	// @IsNotEmpty()
	// @IsUUID()
	// artistRoleId: string;

	@IsNotEmpty()
	@IsString()
	@Length(10, 10)
	artistId: string;

	@IsNotEmpty()
	@IsUUID()
	releaseId: string;

	@IsBoolean()
	@IsNotEmpty()
	addArtistToTracks: boolean;
}

export class UpdateReleaseArtistDto extends PartialType(
	CreateReleaseArtistDto,
) {
	// @IsNotEmpty()
	// @IsUUID()
	// @ValidateIf((_, value) => value !== undefined)
	// artistRoleId: string;

	@IsNotEmpty()
	@Length(10, 10)
	@ValidateIf((_, value) => value !== undefined)
	artistId: string;

	@IsNotEmpty()
	@IsUUID()
	@ValidateIf((_, value) => value !== undefined)
	releaseId: string;

	@IsBoolean()
	@IsOptional()
	addArtistToTracks?: boolean;
}

export class QueryGetListReleaseArtistDto extends BaseQueryDto {}
