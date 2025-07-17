import { IsNotEmpty, IsUUID } from 'class-validator';

export class CreateReleaseCoverArtDto {
	@IsNotEmpty()
	@IsUUID()
	fileId: string;

	// @IsNotEmpty()
	// @IsInt()
	// @Max(MAX_INTEGER)
	// width: number;

	// @IsNotEmpty()
	// @IsInt()
	// @Max(MAX_INTEGER)
	// height: number;
}

// export class UpdateReleaseCoverArtDto extends PartialType(
// 	CreateReleaseCoverArtDto,
// ) {
// 	// @ValidateIf((_, value) => value !== undefined)
// 	// @IsNotEmpty()
// 	// @IsUUID()
// 	// releaseId?: string;

// 	@ValidateIf((_, value) => value !== undefined)
// 	@IsNotEmpty()
// 	@IsUUID()
// 	fileId?: string;

// 	@ValidateIf((_, value) => value !== undefined)
// 	@IsNotEmpty()
// 	@IsInt()
// 	@Max(MAX_INTEGER)
// 	width?: number;

// 	@ValidateIf((_, value) => value !== undefined)
// 	@IsNotEmpty()
// 	@IsInt()
// 	@Max(MAX_INTEGER)
// 	height?: number;

// 	@ValidateIf((_, value) => value !== undefined)
// 	@IsNotEmpty()
// 	@IsString()
// 	@MaxLength(20)
// 	type?: string;
// }

// export class QueryGetListReleaseDto extends BaseQueryDto {}
