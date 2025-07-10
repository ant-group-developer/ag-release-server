import { PartialType } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
export class CreateReleaseLanguageDraftDto {
	@IsUUID()
	@IsOptional()
	metadataLanguageCountryId?: string | null;

	@IsUUID()
	@IsOptional()
	audioLanguageId?: string | null;

	@IsUUID()
	@IsOptional()
	metadataLanguageId?: string | null;

	@IsUUID()
	@IsNotEmpty()
	releaseId: string;
}

export class UpdateReleaseLanguageDraftDto extends PartialType(
	CreateReleaseLanguageDraftDto,
) {
	// @ValidateIf((_, value) => value !== undefined)
	// @IsUUID()
	// @IsNotEmpty()
	// releaseId?: string;
}
