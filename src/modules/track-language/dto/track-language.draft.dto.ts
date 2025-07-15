import { PartialType } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
export class CreateTrackLanguageDraftDto {
	@IsUUID()
	@IsOptional()
	metadataLanguageCountryId?: string | null;

	@IsUUID()
	@IsOptional()
	audioLanguageId?: string | null;

	@IsUUID()
	@IsOptional()
	metadataLanguageId?: string | null;

	// @IsUUID()
	// @IsNotEmpty()
	// trackId: string;
}

export class UpdateTrackLanguageDraftDto extends PartialType(
	CreateTrackLanguageDraftDto,
) {
	// @ValidateIf((_, value) => value !== undefined)
	// @IsUUID()
	// @IsNotEmpty()
	// trackId?: string;
}
