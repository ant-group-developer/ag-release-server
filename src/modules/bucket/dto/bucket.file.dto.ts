import { Transform } from 'class-transformer';
import {
	IsNotEmpty,
	IsNumber,
	IsString,
	MaxLength,
	Min,
} from 'class-validator';
import { generateFileNameWithTimestamp } from 'src/utils/date';

// for function createFile
export class CreateFileDto {
	@IsString()
	@IsNotEmpty()
	@Transform(({ value }: { value: string }) =>
		generateFileNameWithTimestamp(value),
	)
	@MaxLength(100 + 'YYYYMMDDHHmmss_'.length)
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

	@IsString()
	@IsNotEmpty()
	@MaxLength(200)
	key: string;

	@IsString()
	@IsNotEmpty()
	@MaxLength(30)
	bucket: string;
}

// for api createBucket
export class CreateFileDtoSub {
	@IsString()
	@IsNotEmpty()
	@Transform(({ value }: { value: string }) =>
		generateFileNameWithTimestamp(value),
	)
	@MaxLength(100 + 'YYYYMMDDHHmmss_'.length)
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
