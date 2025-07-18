import { IsNotEmpty, IsUUID } from 'class-validator';

export class CreateReleaseCoverArtDto {
	@IsNotEmpty()
	@IsUUID()
	fileId: string;
}
