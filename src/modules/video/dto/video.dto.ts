import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
	IsArray,
	IsBoolean,
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	MaxLength,
	ValidateIf,
} from 'class-validator';
import { VideoAiContent } from '../entities/video.entity';

export class CreateVideoDto {
	@ApiProperty({ format: 'uuid' })
	@IsUUID()
	@IsNotEmpty()
	releaseId: string;

	@ApiProperty({ maxLength: 20 })
	@IsString()
	@IsNotEmpty()
	@MaxLength(20)
	isrc: string;

	@ApiPropertyOptional({ default: false })
	@IsOptional()
	@IsBoolean()
	explicit?: boolean;

	@ApiPropertyOptional({
		enum: VideoAiContent,
		default: VideoAiContent.UNDETERMINED,
	})
	@IsOptional()
	@IsEnum(VideoAiContent)
	aiContent?: VideoAiContent;

	@ApiProperty({ maxLength: 150 })
	@IsString()
	@IsNotEmpty()
	@MaxLength(150)
	channel: string;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	@Transform(({ value }: { value: undefined | string }) =>
		value === undefined ? null : value,
	)
	description?: string | null;

	@ApiPropertyOptional({ type: [String] })
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	keywords?: string[] | null;

	@ApiPropertyOptional({ default: false })
	@IsOptional()
	@IsBoolean()
	isKids?: boolean;

	@ApiPropertyOptional({ default: false })
	@IsOptional()
	@IsBoolean()
	isUnlisted?: boolean;

	@ApiPropertyOptional()
	@IsOptional()
	@IsArray()
	subtitles?: { language: string; fileId: string; fileName: string }[];

	@ApiPropertyOptional({ maxLength: 100 })
	@IsOptional()
	@IsString()
	@MaxLength(100)
	@Transform(({ value }: { value: undefined | string }) =>
		value === undefined ? null : value,
	)
	contentProvider?: string | null;

	@ApiPropertyOptional({ maxLength: 150 })
	@IsOptional()
	@IsString()
	@MaxLength(150)
	@Transform(({ value }: { value: undefined | string }) =>
		value === undefined ? null : value,
	)
	copyrightOwner?: string | null;

	@ApiPropertyOptional({ maxLength: 100 })
	@IsOptional()
	@IsString()
	@MaxLength(100)
	@Transform(({ value }: { value: undefined | string }) =>
		value === undefined ? null : value,
	)
	partnerCustomId1?: string | null;

	@ApiPropertyOptional({ maxLength: 100 })
	@IsOptional()
	@IsString()
	@MaxLength(100)
	@Transform(({ value }: { value: undefined | string }) =>
		value === undefined ? null : value,
	)
	partnerCustomId2?: string | null;

	@ApiPropertyOptional({ format: 'uuid' })
	@IsOptional()
	@IsUUID()
	@Transform(({ value }: { value: undefined | string }) =>
		value === undefined ? null : value,
	)
	fileId?: string | null;
}

export class UpdateVideoDto extends PartialType(CreateVideoDto) {}

export class UpsertReleaseVideoDto extends PartialType(CreateVideoDto) {
	@IsUUID()
	@ValidateIf((_, value) => value !== undefined)
	releaseId?: string;
}
