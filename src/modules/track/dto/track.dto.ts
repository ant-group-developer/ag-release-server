import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
	IsArray,
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	Length,
	MaxLength,
	ValidateIf,
} from 'class-validator';
import { CsvUuidArray } from 'src/common/decorators/csv.decorators';
import { BaseQueryDto } from 'src/common/dtos/common.base-query.dto';
import { LENGTH_PICTURE } from 'src/modules/database/constants/database.constants';
import { FieldOrderTrack, ScanCopyrightStatus } from '../enum/track.enum';

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
	@IsOptional()
	@Transform(({ value }) =>
		value
			? String(value)
					.split(',')
					.map((v) => v.trim())
			: [],
	)
	@IsUUID('4', { each: true })
	@IsArray()
	releaseId?: string[];

	@IsOptional()
	@Transform(({ value }) =>
		value
			? String(value)
					.split(',')
					.map((v) => v.trim())
			: [],
	)
	@Length(10, 10, { each: true })
	@IsArray()
	artistId?: string[];

	@IsOptional()
	@Transform(({ value }) =>
		value
			? String(value)
					.split(',')
					.map((v) => v.trim())
			: [],
	)
	@Length(10, 10, { each: true })
	@IsArray()
	labelId?: string;

	@IsOptional()
	@IsArray()
	@Transform(({ value }) =>
		value
			? String(value)
					.split(',')
					.map((v) => v.trim())
			: [],
	)
	@IsEnum(ScanCopyrightStatus, { each: true })
	scanCopyrightStatus?: ScanCopyrightStatus[];

	@IsOptional()
	@Transform(({ value }) =>
		value
			? String(value)
					.split(',')
					.map((v) => v.trim())
			: [],
	)
	@Length(10, 10, { each: true })
	primaryGenreId?: string[];

	@IsEnum(FieldOrderTrack)
	fieldOrder: string = FieldOrderTrack.CREATED_AT;

	@ApiPropertyOptional({
		description: 'Tenant IDs to filter tracks (comma-separated)',
		type: 'string',
		format: 'uuid',
	})
	@CsvUuidArray()
	tenantIds?: string[];
}

export class BulkDeleteTracksDto {
	@IsArray()
	@Length(10, 10, { each: true })
	ids: string[];
}
