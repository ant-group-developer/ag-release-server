import { PartialType } from '@nestjs/swagger';
import {
	IsInt,
	IsNotEmpty,
	IsString,
	IsUUID,
	Length,
	Max,
	MaxLength,
	Min,
	ValidateIf,
} from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';

export class CreateAudioFileDto {
	@IsNotEmpty()
	@IsString()
	@MaxLength(20)
	sampleRate: string;

	@IsNotEmpty()
	@IsString()
	@MaxLength(10)
	bitrate: string;

	@IsNotEmpty()
	@IsInt()
	@Min(1)
	@Max(64)
	bitDepth: number;

	@IsNotEmpty()
	@IsInt()
	@Min(1)
	duration: number;

	@IsNotEmpty()
	@IsInt()
	@Min(0)
	hook: number;

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

export class SubmitCreateAudioFileDto extends CreateAudioFileDto {}

export class UpdateAudioFileDto extends PartialType(CreateAudioFileDto) {
	@ValidateIf((_, value) => value !== undefined)
	@IsNotEmpty()
	@IsString()
	@MaxLength(20)
	sampleRate?: string;

	@ValidateIf((_, value) => value !== undefined)
	@IsNotEmpty()
	@IsString()
	@MaxLength(10)
	bitrate: string;

	@ValidateIf((_, value) => value !== undefined)
	@IsNotEmpty()
	@IsInt()
	@Min(1)
	@Max(64)
	bitDepth?: number;

	@ValidateIf((_, value) => value !== undefined)
	@IsNotEmpty()
	@IsInt()
	@Min(1)
	duration?: number;

	@ValidateIf((_, value) => value !== undefined)
	@IsNotEmpty()
	@IsInt()
	@Min(0)
	hook?: number;

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

export class QueryGetListAudioFileDto extends BaseQueryDto {
	// @IsEnum(FieldOrderAudioFile)
	// fieldOrder: string = FieldOrderAudioFile.TITLE;
}
