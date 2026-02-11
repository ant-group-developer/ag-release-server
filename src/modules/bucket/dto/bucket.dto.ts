import { Type } from 'class-transformer';
import {
	ArrayMinSize,
	IsArray,
	IsBoolean,
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

class FolderBucket {
	// nếu không truyền keyBucket thì hệ thống sẽ tự generate
	key?: string;

	// mục đích upload, dùng để xác định cấu trúc folder
	@IsEnum(UploadPurpose)
	uploadPurpose: UploadPurpose;

	// id của release, dùng cho các upload gắn với release
	@IsOptional()
	@IsUUID()
	releaseId?: string;

	// tên file track, chỉ dùng cho upload track file
	@IsOptional()
	@MaxLength(80)
	trackFileName?: string;
}

export class CreateBucketDto {
	@IsNotEmpty()
	@ValidateNested()
	@Type(() => CreateFileDto)
	file: CreateFileDto;

	@IsNotEmpty()
	@ValidateNested({ each: true })
	@Type(() => FolderBucket)
	folderBucket: FolderBucket;

	@IsString()
	@IsOptional()
	key: string | null = null;
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

export class GetUrlDownNonFile {
	@IsString()
	@IsNotEmpty()
	url: string;

	@IsBoolean()
	@Type(() => Boolean)
	isPublic: boolean;

	@IsString()
	@IsNotEmpty()
	fileName: string = 'file_name';
}
