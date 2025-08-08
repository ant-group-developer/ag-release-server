import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	Length,
	MaxLength,
	ValidateIf,
} from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';
import { LENGTH_PICTURE } from 'src/modules/database/constants/database.constants';
import { FieldOrderTrack } from '../enum/track.enum';

export class CreateTrackDto {
	@ApiProperty({ example: 'Autumn Without You', maxLength: 100 })
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	title: string;

	@ApiProperty({ example: 'album_cover.jpg', required: false })
	@IsOptional()
	@Transform(({ value }: { value: undefined | string }) => value ?? null)
	@IsString()
	@MaxLength(LENGTH_PICTURE)
	picture: string | null;

	@ApiProperty({
		example: 'Original Version',
		required: false,
		maxLength: 50,
	})
	@IsOptional()
	@IsString()
	@MaxLength(50)
	@Transform(({ value }: { value: undefined | string }) => value ?? null)
	version: string | null;

	@ApiProperty({ example: 'US123456789', required: false })
	@IsOptional()
	@IsString()
	@MaxLength(20)
	@Transform(({ value }: { value: undefined | string }) => value ?? null)
	isrc: string | null;

	@ApiProperty({ example: 'ISWC123456789', required: false })
	@IsOptional()
	@IsString()
	@MaxLength(20)
	@Transform(({ value }: { value: undefined | string }) => value ?? null)
	iswc: string | null;

	@ApiProperty({ example: 'release-id-123' })
	@IsString()
	@IsUUID()
	@IsNotEmpty()
	releaseId: string;

	@ApiProperty({ example: '2025 Exclusive Licensed AMG', required: false })
	@IsNotEmpty()
	@IsString()
	@MaxLength(200)
	pLineOwner: string;

	@ApiProperty({ example: 'primary-genre-id-123', required: false })
	@IsOptional()
	@IsString()
	@IsNotEmpty()
	@Length(10, 10)
	primaryGenreId: string;

	@ApiProperty({ example: 'sub-genre-id-123', required: false })
	@IsOptional()
	@IsString()
	@Length(10, 10)
	@Transform(({ value }: { value: undefined | string }) => value ?? null)
	subGenreId: string | null;
}

export class SubmitCreateTrackDto extends CreateTrackDto {}

export class UpdateTrackDto extends PartialType(CreateTrackDto) {
	@IsString()
	@IsNotEmpty()
	@MaxLength(150)
	@ValidateIf((_, value) => value !== undefined)
	title?: string;

	@IsString()
	@IsNotEmpty()
	@Length(10, 10)
	@ValidateIf((_, value) => value !== undefined)
	primaryGenreId?: string;

	@ValidateIf((_, value) => value !== undefined)
	@IsString()
	@IsNotEmpty()
	@MaxLength(200)
	pLineOwner?: string;
}

export class QueryGetListTrackDto extends BaseQueryDto {
	@IsUUID()
	@IsOptional()
	releaseId?: string;

	@IsOptional()
	@IsString()
	@Length(10, 10)
	artistId?: string | null;

	@IsOptional()
	@Length(10, 10)
	@IsString()
	labelId?: string;

	@IsEnum(FieldOrderTrack)
	fieldOrder: string = FieldOrderTrack.CREATED_AT;
}
