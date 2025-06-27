import { IsNotEmpty } from 'class-validator';

export class GetLinkUploadDto {
	@IsNotEmpty()
	folder: string;

	@IsNotEmpty()
	fileName: string;

	@IsNotEmpty()
	contentType: string;

	@IsNotEmpty()
	fileSize: number;
}
