import {
	IsInt,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	Max,
	MaxLength,
	Min,
} from 'class-validator';
export class CreateAudioFileDraftDto {
	@IsNotEmpty()
	@IsString()
	@MaxLength(20)
	sampleRate: string;

	@IsOptional()
	// @IsNumber()
	bitrate?: number | null;

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
	sampleLength?: number | null;

	@IsOptional()
	@IsInt()
	@Min(0)
	preview?: number | null;

	@IsNotEmpty()
	@IsUUID()
	fileId: string;

	@IsUUID()
	peakId: string;
}
