import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
	IsEnum,
	IsNotEmpty,
	IsNumber,
	IsString,
	Matches,
	Max,
	MaxLength,
} from 'class-validator';
import { generateFileNameWithTimestamp } from 'src/utils/date';
import { EntityTypePicture } from '../enum/bucket.enum';

// non file
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
