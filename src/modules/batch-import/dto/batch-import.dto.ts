import { Type } from 'class-transformer';
import {
	IsArray,
	IsNotEmpty,
	IsNumber,
	IsOptional,
	IsString,
} from 'class-validator';

export class GetBatchImportLogsDto {
	@IsOptional()
	@IsNumber()
	@Type(() => Number)
	page?: number = 1;

	@IsOptional()
	@IsNumber()
	@Type(() => Number)
	pageSize?: number = 20;

	@IsOptional()
	@IsString()
	batchId?: string;

	@IsOptional()
	@IsString()
	status?: string;
}

export class ValidateReleaseDto {
	@IsString()
	@IsNotEmpty()
	tenantCode: string;

	@IsString()
	@IsNotEmpty()
	batchId: string;

	@IsString()
	@IsNotEmpty()
	releaseFolder: string;

	@IsArray()
	@IsNotEmpty()
	excelData: Record<string, unknown>[];

	@IsArray()
	@IsOptional()
	audioFileNames?: string[];

	@IsString()
	@IsOptional()
	thumbnailFileName?: string;
}

export class UploadCompleteDto {
	@IsString()
	@IsNotEmpty()
	logId: string;

	@IsArray()
	@IsNotEmpty()
	storageKeys: string[];
}
