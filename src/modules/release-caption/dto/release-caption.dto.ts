import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	ArrayMinSize,
	IsArray,
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsUUID,
	ValidateNested,
} from 'class-validator';
import { ReleaseCaptionType } from '../entities/release-caption.entity';

export class CreateReleaseCaptionDto {
	@ApiProperty({ format: 'uuid' })
	@IsUUID()
	@IsNotEmpty()
	languageId: string;

	@ApiPropertyOptional({
		enum: ReleaseCaptionType,
		default: ReleaseCaptionType.CAPTION,
	})
	@IsOptional()
	@IsEnum(ReleaseCaptionType)
	type?: ReleaseCaptionType;

	@ApiProperty({ format: 'uuid' })
	@IsUUID()
	@IsNotEmpty()
	fileId: string;
}

export class UpdateReleaseCaptionDto extends PartialType(
	CreateReleaseCaptionDto,
) {}

export class BulkUpsertReleaseCaptionsDto {
	@ApiProperty({ format: 'uuid' })
	@IsUUID()
	@IsNotEmpty()
	releaseId: string;

	@ApiProperty({ type: [CreateReleaseCaptionDto] })
	@IsArray()
	@ArrayMinSize(1)
	@ValidateNested({ each: true })
	@Type(() => CreateReleaseCaptionDto)
	captions: CreateReleaseCaptionDto[];
}
