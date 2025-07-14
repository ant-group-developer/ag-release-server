import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
	ArrayMinSize,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	Length,
	MaxLength,
	ValidateIf,
	ValidateNested,
} from 'class-validator';
import { CreateAudioFileDraftDto } from 'src/modules/audio-file/dto/audio-file.draft.dto';
import { LENGTH_PICTURE } from 'src/modules/database/constants/database.constants';

export class CreateTrackDraftDto {
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
	@IsOptional()
	@IsString()
	@MaxLength(200)
	@Transform(({ value }: { value: undefined | string }) => value ?? null)
	pLineOwner: string | null;

	@ApiProperty({ example: 'primary-genre-id-123', required: false })
	@IsOptional()
	@IsString()
	@Length(10, 10)
	@Transform(({ value }: { value: undefined | string }) => value ?? null)
	primaryGenreId: string | null;

	@ApiProperty({ example: 'sub-genre-id-123', required: false })
	@IsOptional()
	@IsString()
	@Length(10, 10)
	@Transform(({ value }: { value: undefined | string }) => value ?? null)
	subGenreId: string | null;

	@IsNotEmpty()
	@ValidateNested()
	@Type(() => CreateAudioFileDraftDto)
	audioFileDraft?: Omit<CreateAudioFileDraftDto, 'trackId'>;
}

export class BulkCreateTrackDraft {
	@IsNotEmpty()
	@ArrayMinSize(1)
	@ValidateNested({ each: true })
	@Type(() => CreateTrackDraftDto)
	trackDrafts: CreateTrackDraftDto[];
}

export class UpdateTrackDraftDto extends PartialType(CreateTrackDraftDto) {
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	@ValidateIf((_, value) => value !== undefined)
	title?: string;

	// @ApiProperty({ example: 'release-id-123' })
	// @ValidateIf((_, value) => value !== undefined)
	// @IsString()
	// @IsUUID()
	// @IsNotEmpty()
	// releaseId?: string;
}
