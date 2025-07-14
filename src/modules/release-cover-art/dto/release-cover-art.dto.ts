import { PartialType } from '@nestjs/swagger';
import {
	IsInt,
	IsNotEmpty,
	IsString,
	IsUUID,
	Max,
	MaxLength,
	ValidateIf,
} from 'class-validator';
import { MAX_INTEGER } from 'src/modules/database/constants/database.constants';

export class CreateReleaseCoverArtDto {
	@IsNotEmpty()
	@IsUUID()
	releaseId: string;

	@IsNotEmpty()
	@IsUUID()
	fileId: string;

	@IsNotEmpty()
	@IsInt()
	@Max(MAX_INTEGER)
	width: number;

	@IsNotEmpty()
	@IsInt()
	@Max(MAX_INTEGER)
	height: number;

	@IsNotEmpty()
	@IsString()
	@MaxLength(20)
	type: string;
}

export class UpdateReleaseCoverArtDto extends PartialType(
	CreateReleaseCoverArtDto,
) {
	@ValidateIf((_, value) => value !== undefined)
	@IsNotEmpty()
	@IsUUID()
	releaseId?: string;

	@ValidateIf((_, value) => value !== undefined)
	@IsNotEmpty()
	@IsUUID()
	fileId?: string;

	@ValidateIf((_, value) => value !== undefined)
	@IsNotEmpty()
	@IsInt()
	@Max(MAX_INTEGER)
	width?: number;

	@ValidateIf((_, value) => value !== undefined)
	@IsNotEmpty()
	@IsInt()
	@Max(MAX_INTEGER)
	height?: number;

	@ValidateIf((_, value) => value !== undefined)
	@IsNotEmpty()
	@IsString()
	@MaxLength(20)
	type?: string;
}

// export class QueryGetListReleaseDto extends BaseQueryDto {}
