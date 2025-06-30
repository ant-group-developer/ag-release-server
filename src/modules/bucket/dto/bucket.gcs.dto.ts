import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
	IsNotEmpty,
	IsNumber,
	IsString,
	Matches,
	Max,
	MaxLength,
} from 'class-validator';
import { generateFileNameWithTimestamp } from 'src/utils/date';

export class GetUrlUploadDto {
	@IsNotEmpty()
	folder: string;

	@IsNotEmpty()
	fileName: string;

	@IsNotEmpty()
	contentType: string;

	@IsNotEmpty()
	fileSize: number;
}

export class GenerateGcsPictureUploadUrlDto {
	@ApiProperty({
		description:
			'Entity type related to the picture (e.g., artist, label, genre)',
		example: 'artist',
		maxLength: 20,
	})
	@IsNotEmpty()
	@MaxLength(20)
	@IsString()
	entityType: string;

	@ApiProperty({
		description: 'File name of the image to be uploaded',
		example: 'cover-image.jpg',
		maxLength: 100,
	})
	@IsNotEmpty()
	@MaxLength(100)
	@IsString()
	@Transform(({ value }) => generateFileNameWithTimestamp(value))
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
