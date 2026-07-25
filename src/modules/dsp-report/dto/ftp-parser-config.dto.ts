import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
	IsArray,
	IsBoolean,
	IsOptional,
	IsString,
	ValidateNested,
} from 'class-validator';

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
		description:
			'Optional safe transform: trim (default), raw, uppercase, lowercase, or isrc.',
		example: 'isrc',
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

	@ApiPropertyOptional({ default: true })
	@IsOptional()
	@IsBoolean()
	isActive?: boolean;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	description?: string;
}

export class UpdateFtpParserFieldMappingsDto {
	@ApiProperty({
		description:
			'Replaces mappings for one parser code. Unmapped parser logic remains hard-coded.',
		type: [FtpParserFieldMappingDto],
	})
	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => FtpParserFieldMappingDto)
	fieldMappings: FtpParserFieldMappingDto[];
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

export class SyncParserCatalogDto {
	@ApiPropertyOptional({
		description:
			'Rewrite the parser catalog and its default field mappings even when source hashes are unchanged.',
		default: false,
	})
	@IsOptional()
	@IsBoolean()
	@Transform(({ value }) => value === true || value === 'true')
	force?: boolean = false;
}
