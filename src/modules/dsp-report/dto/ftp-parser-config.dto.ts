import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';
import { ValidateNested } from 'class-validator';

export enum FtpSourceCategory {
	TRENDS = 'trends',
	USAGE = 'usage',
	SALES = 'sales',
	ILLEGITIMATE_ACTIVITY = 'illegitimate_activity',
}

export class FtpParserFieldMappingDto {
	@ApiProperty({
		description: 'Exact column header in the source report file',
		example: 'ISRC',
	})
	@IsString()
	reportColumn: string;

	@ApiProperty({
		description: 'Destination column in the target ClickHouse fact table',
		example: 'isrc',
	})
	@IsString()
	targetColumn: string;

	@ApiPropertyOptional({
		description: 'Optional transformation applied by the parser',
		example: 'normalize ISRC and remove hyphens',
	})
	@IsOptional()
	@IsString()
	transform?: string;
}

export class UpsertFtpParserConfigDto {
	@ApiProperty({
		description: 'Parser code returned by /dsp-report/parser-catalog',
	})
	@IsString()
	parserCode: string;

	@ApiPropertyOptional({ type: [String], default: [] })
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	includePatterns?: string[];

	@ApiPropertyOptional({ type: [String], default: [] })
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	excludePatterns?: string[];

	@ApiPropertyOptional({
		description:
			'Human-readable mapping from report columns to columns in the target fact table. This documents the parser; it does not replace parser code.',
		type: [FtpParserFieldMappingDto],
		default: [],
	})
	@IsOptional()
	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => FtpParserFieldMappingDto)
	fieldMappings?: FtpParserFieldMappingDto[];

	@ApiPropertyOptional({ default: true })
	@IsOptional()
	@IsBoolean()
	isActive?: boolean;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	description?: string;
}

export class PreviewFtpParserConfigDto {
	@ApiProperty({ type: [String], example: ['daily/report_202607.csv'] })
	@IsArray()
	@IsString({ each: true })
	filePaths: string[];

	@ApiPropertyOptional({ type: UpsertFtpParserConfigDto })
	@IsOptional()
	config?: UpsertFtpParserConfigDto;
}
