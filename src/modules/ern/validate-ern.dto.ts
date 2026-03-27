// src/modules/ern/dto/validate-ern.dto.ts
import { IsOptional, IsString } from 'class-validator';

export class ValidateErnDto {
	@IsString()
	filePath: string;

	@IsOptional()
	@IsString()
	version?: string = '4.3';
}
