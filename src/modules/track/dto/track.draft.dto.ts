import { ApiProperty, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	ArrayMinSize,
	IsInt,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	Length,
	MaxLength,
	Min,
	ValidateIf,
	ValidateNested,
} from 'class-validator';
import { CreateAudioFileDraftDto } from 'src/modules/audio-file/dto/audio-file.draft.dto';

export class CreateTrackDraftDto {
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
	version?: string;

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

	@ApiProperty({ example: 'release-id-123' })
	@IsString()
	@IsUUID()
	@IsNotEmpty()
	releaseId: string;

	@ApiProperty({ example: '2025 Exclusive Licensed AMG', required: false })
	@IsOptional()
	@IsString()
	@MaxLength(200)
	pLineOwner?: string;

	@ApiProperty({ example: 'primary-genre-id-123', required: false })
	@IsOptional()
	@IsString()
	@Length(10, 10)
	primaryGenreId?: string;

	@ApiProperty({ example: 'sub-genre-id-123', required: false })
	@IsOptional()
	@IsString()
	@Length(10, 10)
	subGenreId?: string;

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

export class BulkUpdateTrackDraft {
	@IsNotEmpty()
	@ArrayMinSize(1)
	@ValidateNested({ each: true })
	@Type(() => UpdateOrderTrackDraft)
	trackDrafts: UpdateOrderTrackDraft[];
}

export class UpdateOrderTrackDraft {
	@Length(10, 10)
	@IsNotEmpty()
	id: string;

	@IsInt()
	@IsNotEmpty()
	@Min(0)
	order: number;
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
