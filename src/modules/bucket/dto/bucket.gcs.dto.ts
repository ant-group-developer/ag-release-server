import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
	ArrayMinSize,
	IsArray,
	IsEnum,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsString,
	IsUUID,
	Matches,
	Max,
	MaxLength,
	ValidateNested,
} from 'class-validator';
import { generateFileNameWithTimestamp } from 'src/utils/date';
import { EntityTypePicture, UploadPurpose } from '../enum/bucket.enum';
import { CreateFileDtoSub } from './bucket.file.dto';

export class GetSignedUrlUploadDto {
	@IsNotEmpty()
	key: string;

	@IsNotEmpty()
	contentType: string;

	isPublic: boolean = false;
}

export class GetSignedUrlReadDto {
	@IsNotEmpty()
	key: string;

	isPublic: boolean = false;
}

export class GetSignedUrlDownDto {
	@IsNotEmpty()
	key: string;

	isPublic: boolean = false;

	fileName: string;
}

export class GeneratePublicUploadUrlDto {
	@ApiProperty({
		description:
			'Entity type related to the picture (e.g., artists, genres)',
		example: EntityTypePicture.ARTIST,
		enum: EntityTypePicture,
	})
	@IsNotEmpty()
	@IsEnum(EntityTypePicture)
	entityType: EntityTypePicture;

	@ApiProperty({
		description: 'File name of the image to be uploaded',
		example: 'cover-image.jpg',
		maxLength: 100,
	})
	@IsNotEmpty()
	@MaxLength(100 + 'YYYYMMDDHHmmss_'.length)
	@IsString()
	@Transform(({ value }: { value: string }) =>
		generateFileNameWithTimestamp(value),
	)
	fileName: string;

	@ApiProperty({
		description: 'Size of the file in bytes (maximum 3MB)',
		example: 307200, // 300KB
	})
	@IsNotEmpty()
	@IsNumber()
	@Max(3 * 1024 * 1024, { message: 'Maximum allowed file size is 3MB' })
	fileSize: number;

	@ApiProperty({
		description: 'MIME type of the image file',
		example: 'image/jpeg',
	})
	@IsNotEmpty()
	@Matches(/^image\/(jpeg|png|gif|webp|jpg)$/i, {
		message:
			'Only image content types are allowed (jpeg, png, gif, webp, jpg)',
	})
	contentType: string;
}

export class CreateBucketDto {
	@IsNotEmpty()
	@ValidateNested()
	@Type(() => CreateFileDtoSub)
	file: CreateFileDtoSub;

	@IsEnum(UploadPurpose)
	uploadPurpose: UploadPurpose;

	@IsString()
	@IsOptional()
	key: string | null = null;
}

export class BulkCreateBucketDto {
	@IsNotEmpty()
	@ArrayMinSize(1)
	@ValidateNested({ each: true })
	@Type(() => CreateBucketDto)
	createBucketDtos: CreateBucketDto[];
}

export class BulkSubmitDto {
	@IsArray()
	@ArrayMinSize(1)
	@IsUUID('4', { each: true })
	ids: string[];
}
