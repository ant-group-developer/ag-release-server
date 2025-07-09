import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	ArrayMinSize,
	IsInt,
	IsNotEmpty,
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
export class CreateAudioFileDraftDto {
	@IsNotEmpty()
	@IsString()
	@MaxLength(20)
	sampleRate: string;

	@IsOptional()
	@IsString()
	@MaxLength(10)
	bitrate?: string | null;

	@IsOptional()
	@IsInt()
	@Min(1)
	@Max(64)
	bitDepth?: number | null;

	@IsInt()
	@Min(1)
	duration: number;

	@IsOptional()
	@IsInt()
	@Min(0)
	hook?: number | null;

	@IsNotEmpty()
	@IsString()
	@Length(10, 10)
	trackId: string;

	@IsNotEmpty()
	@IsUUID()
	fileId: string;

	@IsUUID()
	peakId: string;
}

export class BulkCreateAudioFileDraft {
	@IsNotEmpty()
	@ArrayMinSize(1)
	@ValidateNested({ each: true })
	@Type(() => CreateAudioFileDraftDto)
	createAudioFileDraftDtos: CreateAudioFileDraftDto[];
}

export class UpdateAudioFileDraftDto extends PartialType(
	CreateAudioFileDraftDto,
) {
	@ValidateIf((_, value) => value !== undefined)
	@IsNotEmpty()
	@IsString()
	@MaxLength(20)
	sampleRate?: string;

	@ValidateIf((_, value) => value !== undefined)
	@IsInt()
	@Min(1)
	duration?: number;

	@ValidateIf((_, value) => value !== undefined)
	@IsNotEmpty()
	@IsString()
	@Length(10, 10)
	trackId?: string;

	@ValidateIf((_, value) => value !== undefined)
	@IsNotEmpty()
	@IsUUID()
	fileId?: string;

	@ValidateIf((_, value) => value !== undefined)
	@IsUUID()
	peakId?: string;
}
