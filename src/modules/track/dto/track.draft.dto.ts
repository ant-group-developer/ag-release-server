import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	ArrayMinSize,
	IsBoolean,
	IsIn,
	IsInt,
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
import { CreateAudioFileDraftDto } from 'src/modules/audio-file/dto/audio-file.draft.dto';
import { MAX_INTEGER } from 'src/modules/database/constants/database.constants';
import { UpdateTrackLanguageDraftDto } from 'src/modules/track-language/dto/track-language.draft.dto';

export class CreateTrackDraftDto {
	@Length(10, 10)
	@IsOptional()
	id?: string;

	@ApiProperty({ example: 'Autumn Without You', maxLength: 100 })
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	title: string;

	@ApiProperty({
		example: 'Original Version',
		required: false,
		maxLength: 50,
	})
	@IsOptional()
	@IsString()
	@MaxLength(50)
	version?: string | null;

	@ApiProperty({ example: 'US123456789', required: false })
	@IsOptional()
	@IsString()
	@MaxLength(20)
	isrc?: string;

	@ApiProperty({ example: 'ISWC123456789', required: false })
	@IsOptional()
	@IsString()
	@MaxLength(20)
	iswc?: string;

	@ApiProperty({ example: false, required: false, default: false })
	@IsOptional()
	@IsBoolean()
	isInstrumental?: boolean;

	@ApiProperty({ example: 'release-id-123' })
	@IsString()
	@IsUUID()
	@IsNotEmpty()
	releaseId: string;

	@ApiProperty({ example: 2025 })
	@IsNumber()
	@IsOptional()
	@Min(1000)
	@Max(9999)
	pLineYear?: number | null;

	@ApiProperty({ example: '2025 Exclusive Licensed AMG', required: false })
	@IsOptional()
	@IsString()
	@MaxLength(200)
	pLineOwner?: string | null;

	@ApiProperty({ example: 'primary-genre-id-123', required: false })
	@IsOptional()
	@IsString()
	@Length(10, 10)
	primaryGenreId?: string | null;

	@ApiProperty({ example: 'sub-genre-id-123', required: false })
	@IsOptional()
	@IsString()
	@Length(10, 10)
	subGenreId?: string | null;

	@IsNotEmpty()
	@ValidateNested()
	@Type(() => CreateAudioFileDraftDto)
	audioFileDraft: CreateAudioFileDraftDto;

	@IsOptional()
	@IsUUID()
	priceTierId?: string | null;

	@IsOptional()
	@Min(0)
	@Max(1000)
	@IsNumber()
	order?: number;
}

export class BulkCreateTrackDraft {
	@IsNotEmpty()
	@ArrayMinSize(1)
	@ValidateNested({ each: true })
	@Type(() => CreateTrackDraftDto)
	trackDrafts: CreateTrackDraftDto[];
}

class AudioFile {
	@IsOptional()
	@IsInt()
	@Max(MAX_INTEGER)
	sampleLength?: number;

	@IsOptional()
	@IsInt()
	@Max(MAX_INTEGER)
	preview?: number;

	@IsOptional()
	@ValidateNested()
	@Type(() => File)
	file?: File;
}

export class UpdateTrackDraftDto extends PartialType(CreateTrackDraftDto) {
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	@ValidateIf((_, value) => value !== undefined)
	title?: string;

	@IsOptional()
	@IsUUID()
	trackOriginTypeId?: string;

	@IsOptional()
	@IsUUID()
	trackTypeId?: string;

	@IsOptional()
	@IsUUID()
	trackSensitiveId?: string;

	@IsNotEmpty()
	@IsBoolean()
	@ValidateIf((_, value) => value !== undefined)
	isByAi?: boolean;

	@IsOptional()
	@IsString()
	@MaxLength(5000)
	lyric?: string;

	@IsOptional()
	@IsUUID()
	priceTierId?: string | null;

	//
	@IsOptional()
	@ValidateNested()
	@Type(() => UpdateTrackLanguageDraftDto)
	trackLanguage?: UpdateTrackLanguageDraftDto;

	@IsOptional()
	@ValidateNested()
	@Type(() => AudioFile)
	audioFile?: AudioFile;

	@IsOptional()
	@IsBoolean()
	copyArtistsFromRelease?: boolean;
}

export class UpdateTrackPolicyDto {
	@IsUUID()
	@ValidateIf((_, value) => value !== undefined)
	actionId?: string;
}

export class BulkUpdateTrackDraft {
	@IsNotEmpty()
	@ArrayMinSize(1)
	@ValidateNested({ each: true })
	@Type(() => UpdateTrackDraftDto)
	trackDrafts: UpdateTrackDraftDto[];
}

export class ReplaceTrackAudioDto {
	@IsUUID()
	@IsNotEmpty()
	fileId: string;

	@IsString()
	@IsIn(['44100', '48000'])
	sampleRate: string;

	@IsInt()
	@IsIn([16, 24])
	bitDepth: number;

	@IsOptional()
	@IsNumber()
	@Min(1)
	bitrate?: number | null;

	@IsInt()
	@Min(1)
	@Max(2147483647)
	duration: number;
}
