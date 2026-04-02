// src/modules/ern/dto/validate-ern.dto.ts
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ErnVersion } from './interfaces/ern-input.interface';

export class ValidateErnDto {
	@IsString()
	filePath: string;

	@IsOptional()
	@IsEnum(ErnVersion)
	version?: ErnVersion = ErnVersion.ERN_43;
}
