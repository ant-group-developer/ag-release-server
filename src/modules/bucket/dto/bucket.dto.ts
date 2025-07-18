import { Type } from 'class-transformer';
import {
	ArrayMinSize,
	IsArray,
	IsEnum,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsString,
	IsUUID,
	MaxLength,
	Min,
	ValidateNested,
} from 'class-validator';
import { UploadPurpose } from '../enum/bucket.enum';

class CreateFileDto {
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	fileName: string;

	@IsString()
	@IsNotEmpty()
	@MaxLength(30)
	contentType: string;

	@IsString()
	@IsNotEmpty()
	@MaxLength(10)
	extension: string;

	@IsNumber()
	@Min(0)
	fileSize: number;
}

export class CreateBucketDto {
	@IsNotEmpty()
	@ValidateNested()
	@Type(() => CreateFileDto)
	file: CreateFileDto;

	@IsNotEmpty()
	folderBucket: string;

	@IsString()
	@IsOptional()
	key: string | null = null;
}

export class GetFolderBucketDto {
	@IsEnum(UploadPurpose)
	@IsNotEmpty()
	uploadPurpose: UploadPurpose;

	@IsNotEmpty()
	@IsUUID()
	releaseId: string;

	@IsOptional()
	trackName?: string;
}

export class BulkCreateBucketDto {
	@IsNotEmpty()
	@ArrayMinSize(1)
	@ValidateNested({ each: true })
	@Type(() => CreateBucketDto)
	bucketDtos: CreateBucketDto[];
}

export class BulkSubmitDto {
	@IsArray()
	@ArrayMinSize(1)
	@IsUUID('4', { each: true })
	ids: string[];
}
