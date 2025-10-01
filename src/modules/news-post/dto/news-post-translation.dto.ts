import {
	IsBoolean,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
} from 'class-validator';

export class CreateNewsPostTranslationDto {
	@IsUUID()
	@IsNotEmpty()
	newsPostId: string;

	@IsNotEmpty()
	@IsString()
	languageCode: string;

	@IsNotEmpty()
	@IsString()
	title: string;

	@IsOptional()
	@IsString()
	description?: string;

	@IsNotEmpty()
	@IsString()
	content: string;

	@IsOptional()
	@IsBoolean()
	isDefault: boolean = false;

	userId: string;
}
