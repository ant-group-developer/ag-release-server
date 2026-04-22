// src/modules/ern/dto/validate-ern.dto.ts
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ErnVersion2 } from './interfaces/ern-input.interface';

export class ValidateErnDto2 {
	@IsString()
	filePath: string;

	@IsOptional()
	@IsEnum(ErnVersion2)
	version?: ErnVersion2 = ErnVersion2.ERN_43;
}
