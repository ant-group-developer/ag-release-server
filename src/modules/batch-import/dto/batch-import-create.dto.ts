import { IsArray, IsNotEmpty, IsString } from 'class-validator';

export class CreateReleaseFromExcelDto {
	@IsString()
	@IsNotEmpty()
	logId: string;

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
	@IsNotEmpty()
	storageKeys: string[];
}
