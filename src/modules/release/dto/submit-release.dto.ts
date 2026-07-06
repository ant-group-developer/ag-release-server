import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';
import { CiImportAction } from '../enum/ci-import-action.enum';

export class SubmitReleaseDto {
	@ApiProperty({
		description: 'Danh sách code',
		example: ['A001', 'A002'],
		type: [String],
	})
	@IsArray()
	@IsString({ each: true })
	code: string[];

	@ApiPropertyOptional({
		enum: CiImportAction,
		default: CiImportAction.KEEP_CURRENT_STATUS,
	})
	@IsOptional()
	@IsEnum(CiImportAction)
	ciImportAction?: CiImportAction = CiImportAction.FORCE_CI_IMPORT;
}
