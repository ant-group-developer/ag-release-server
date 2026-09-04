import { Type } from 'class-transformer';
import {
	ArrayMaxSize,
	ArrayMinSize,
	IsArray,
	IsInt,
	IsNotEmpty,
	IsString,
	Max,
	Min,
	ValidateNested,
} from 'class-validator';
import { CreateBucketDto } from './bucket.dto';

export class InitiateMultipartUploadDto extends CreateBucketDto {}

export class PresignMultipartPartDto {
	@IsInt()
	@Min(1)
	@Max(10_000)
	partNumber: number;
}

export class PresignMultipartPartsDto {
	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(10_000)
	@IsInt({ each: true })
	@Min(1, { each: true })
	@Max(10_000, { each: true })
	partNumbers: number[];
}

export class CompletedPartDto {
	@IsInt()
	@Min(1)
	@Max(10_000)
	partNumber: number;

	@IsString()
	@IsNotEmpty()
	eTag: string;
}

export class CompleteMultipartUploadDto {
	@IsArray()
	@ArrayMinSize(1)
	@ArrayMaxSize(10_000)
	@ValidateNested({ each: true })
	@Type(() => CompletedPartDto)
	parts: CompletedPartDto[];
}
