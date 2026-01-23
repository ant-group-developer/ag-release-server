import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class ParseReleaseCiDto {
	@ApiProperty({
		description: 'Release ID',
		example: 'b2f4c2c1-2d2c-4f9b-9f9a-1f2b3c4d5e6f',
	})
	@IsString()
	@IsUUID()
	releaseId: string;

	@ApiPropertyOptional({
		description:
			'Batch folder name. If not provided, system will generate a uuid.',
		example: 'batch_2026_01_22',
	})
	@IsOptional()
	@IsString()
	batchId?: string;
}

export class ImportReleaseCiDto {
	@ApiProperty()
	@IsUUID()
	releaseId: string;

	@ApiPropertyOptional()
	@IsString()
	batchId: string;
}
