import { PartialType } from '@nestjs/swagger';
import {
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	Length,
	ValidateIf,
} from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';

export class CreateTrackArtistDto {
	@IsNotEmpty()
	@IsUUID()
	artistRoleId: string;

	@IsNotEmpty()
	@IsString()
	@Length(10, 10)
	artistId: string;

	@IsNotEmpty()
	@Length(10, 10)
	trackId: string;
}

export class UpdateTrackArtistDto extends PartialType(CreateTrackArtistDto) {
	@IsNotEmpty()
	@IsUUID()
	@ValidateIf((_, value) => value !== undefined)
	artistRoleId: string;

	@IsNotEmpty()
	@Length(10, 10)
	@ValidateIf((_, value) => value !== undefined)
	artistId: string;

	@IsNotEmpty()
	@IsUUID()
	@ValidateIf((_, value) => value !== undefined)
	trackId: string;
}

export class QueryGetListTrackArtistDto extends BaseQueryDto {
	@Length(10, 10)
	@IsOptional()
	trackId?: string;
}
