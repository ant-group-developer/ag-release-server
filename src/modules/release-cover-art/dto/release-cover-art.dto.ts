import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { generateFileNameWithTimestamp } from 'src/utils/date';

export class CreateReleaseCoverArtDto {
	@IsNotEmpty()
	@IsString()
	@Transform(({ value }) => generateFileNameWithTimestamp(value))
	fileName: string;

	// @IsNotEmpty()
	// @IsString()
	// key: string;

	@IsNotEmpty()
	@IsString()
	contentType: string;

	@IsNotEmpty()
	@IsString()
	extension: string;

	@IsNotEmpty()
	@IsInt()
	fileSize: number;

	// @IsNotEmpty()
	// @IsString()
	// bucket: string;

	@IsNotEmpty()
	@IsUUID()
	releaseId: string;

	@IsNotEmpty()
	@IsInt()
	width: number;

	@IsNotEmpty()
	@IsInt()
	height: number;

	@IsNotEmpty()
	@IsString()
	type: string;
}

// export class UpdateReleaseDto extends PartialType(CreateReleaseCoverArtDto) {}

// export class QueryGetListReleaseDto extends BaseQueryDto {}
