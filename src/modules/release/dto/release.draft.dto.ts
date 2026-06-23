import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
	IsBoolean,
	IsDate,
	IsEnum,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsString,
	IsUUID,
	Length,
	Max,
	MaxLength,
	Min,
	ValidateIf,
	ValidateNested,
} from 'class-validator';
import { CreateReleaseCoverArtDto } from 'src/modules/release-cover-art/dto/release-cover-art.dto';
import { UpdateReleaseLanguageDraftDto } from 'src/modules/release-language/dto/release-language.draft.dto';
import { UpdateReleaseTerritoryDto } from 'src/modules/release-territory/dto/release-territory.dto';
import { UpsertReleaseVideoDto } from 'src/modules/video/dto/video.dto';
import { ReleaseTimeMode } from '../enum/release.enum';

export class CreateReleaseDraftDto {
	@ApiPropertyOptional({
		enum: ['audio', 'video'],
		example: 'video',
		description: 'Release content type. Use video for VEVO video release.',
	})
	@IsOptional()
	@IsString()
	type?: 'audio' | 'video';

	@ApiProperty({ example: 'Autumn Without You', maxLength: 150 })
	@IsString()
	@IsNotEmpty()
	@MaxLength(150)
	title: string;

	@ApiProperty({
		example: 'Original Version',
		maxLength: 150,
		required: false,
	})
	@IsOptional()
	@IsString()
	@MaxLength(150)
	version?: string | null;

	@ApiProperty({ example: '893123456789', required: false })
	@IsOptional()
	@IsString()
	@MaxLength(20)
	upc?: string | null;

	@ApiProperty({ example: 'JzCTrtvkEn' })
	@IsString()
	@IsOptional()
	@Length(10, 10)
	primaryGenreId?: string | null;

	@ApiProperty({ example: 'JzCTrtvkEn', required: false })
	@IsOptional()
	@IsString()
	@Length(10, 10)
	subGenreId?: string | null;

	@IsOptional()
	isVariousArtist?: boolean;

	@ApiPropertyOptional({ example: false, default: false })
	@IsOptional()
	@IsBoolean()
	isInstrumental?: boolean;

	@ApiProperty({ example: 'Zz2jDwRg6T' })
	@IsString()
	@IsOptional()
	@Length(10, 10)
	labelId?: string | null;

	@IsOptional()
	@Length(10, 10)
	albumFormatId?: string;

	@ApiProperty({ example: 2025 })
	@IsNumber()
	@IsOptional()
	@Min(1000)
	@Max(9999)
	cLineYear?: number | null;

	@ApiProperty({ example: 'Exclusive Licensed AMG' })
	@IsString()
	@IsOptional()
	@MaxLength(200)
	cLineOwner?: string | null;

	@ApiProperty({ example: 2025 })
	@IsNumber()
	@IsOptional()
	@Min(1000)
	@Max(9999)
	pLineYear?: number | null;

	@ApiProperty({ example: 'Exclusive Licensed AMG' })
	@IsString()
	@IsOptional()
	@MaxLength(200)
	pLineOwner: string | null;

	@ApiProperty({ example: 'A1234' })
	@IsOptional()
	@IsString()
	@MaxLength(100)
	catalogId?: string | null;

	@IsOptional()
	@IsEnum(ReleaseTimeMode)
	releaseTimeMode?: ReleaseTimeMode;

	@ApiProperty({ example: '2025-07-01' })
	@IsOptional()
	@Transform(({ value }: { value: string | undefined }) =>
		value ? new Date(value) : undefined,
	)
	@IsDate()
	releaseDate?: Date | null;

	@ApiProperty({ example: '2025-12-31', required: false })
	@IsOptional()
	@Transform(({ value }: { value: string | null | undefined }) =>
		value ? new Date(value) : value,
	)
	@IsDate()
	releaseEndDate?: Date | null;

	@ApiProperty({ example: '2025-07-01' })
	@IsOptional()
	@Transform(({ value }: { value: string | undefined }) =>
		value ? new Date(value) : undefined,
	)
	@IsDate()
	releaseOriginalDate?: Date | null;

	@ApiProperty({ example: '18:00' })
	@IsOptional()
	@IsString()
	@MaxLength(10)
	releaseTime?: string | null;

	@ApiProperty({
		example: '2c9bcd45-4f34-4e98-8ba6-3d5bcbcd11b1',
		required: false,
	})
	@IsOptional()
	@IsUUID()
	releaseTimezoneId?: string | null;

	@IsOptional()
	@IsUUID()
	priceTierId?: string | null;

	@ApiPropertyOptional({
		type: () => UpsertReleaseVideoDto,
		nullable: true,
		description:
			'VEVO video metadata. Send null on update to remove linked video metadata.',
	})
	@IsOptional()
	@ValidateNested()
	@Type(() => UpsertReleaseVideoDto)
	video?: UpsertReleaseVideoDto | null;
}

export class UpdateReleaseDraftDto extends PartialType(CreateReleaseDraftDto) {
	@IsString()
	@IsNotEmpty()
	@MaxLength(150)
	@ValidateIf((_, value) => value !== undefined)
	title?: string;

	@IsNotEmpty()
	@Length(10, 10)
	@ValidateIf((_, value) => value !== undefined)
	albumFormatId?: string;

	@IsString()
	@IsOptional()
	@Length(10, 10)
	primaryGenreId?: string | null;

	@IsString()
	@IsOptional()
	@Length(10, 10)
	labelId?: string | null;

	@IsOptional()
	@ValidateNested()
	@Type(() => CreateReleaseCoverArtDto)
	@ApiPropertyOptional({
		type: () => CreateReleaseCoverArtDto,
		nullable: true,
	})
	releaseCoverArt?: CreateReleaseCoverArtDto | null;

	@IsOptional()
	@ValidateNested()
	@Type(() => UpdateReleaseLanguageDraftDto)
	@ApiPropertyOptional({ type: () => UpdateReleaseLanguageDraftDto })
	releaseLanguage?: UpdateReleaseLanguageDraftDto;

	@IsOptional()
	@ValidateNested()
	@Type(() => UpdateReleaseTerritoryDto)
	@ApiPropertyOptional({ type: () => UpdateReleaseTerritoryDto })
	releaseTerritory?: UpdateReleaseTerritoryDto;

	@IsOptional()
	@IsUUID()
	@ValidateIf((_, value) => value !== undefined)
	priceTierId?: string | null;

	@IsOptional()
	@ValidateNested()
	@Type(() => UpsertReleaseVideoDto)
	@ApiPropertyOptional({
		type: () => UpsertReleaseVideoDto,
		nullable: true,
		description:
			'VEVO video metadata. Send null to remove linked video metadata.',
	})
	video?: UpsertReleaseVideoDto | null;
}

export class SyncReleaseToTracksDto {
	@ApiPropertyOptional({ example: true })
	@IsOptional()
	@IsBoolean()
	syncPrimaryGenre?: boolean;

	@ApiPropertyOptional({ example: true })
	@IsOptional()
	@IsBoolean()
	syncSubGenre?: boolean;

	@ApiPropertyOptional({ example: true })
	@IsOptional()
	@IsBoolean()
	syncLanguage?: boolean;

	@ApiPropertyOptional({ example: true })
	@IsOptional()
	@IsBoolean()
	syncCopyright?: boolean;

	@ApiPropertyOptional({ example: true })
	@IsOptional()
	@IsBoolean()
	syncArtists?: boolean;

	@ApiPropertyOptional({ example: true })
	@IsOptional()
	@IsBoolean()
	syncContributors?: boolean;
}
