import { IsNotEmpty, IsString, Matches, Max, MaxLength } from 'class-validator';

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
	@IsNotEmpty()
	@MaxLength(20)
	@IsString()
	entityType: string;

	@IsNotEmpty()
	@MaxLength(100)
	@IsString()
	fileName: string;

	@IsNotEmpty()
	@Max(3 * 1024 * 1024, { message: 'Maximum allowed file size is 3MB' })
	fileSize: number;

	@IsNotEmpty()
	@Matches(/^image\/(jpeg|png|gif|webp|jpg)$/i, {
		message:
			'Only image content types are allowed (jpeg, png, gif, webp, jpg)',
	})
	contentType: string;
}
