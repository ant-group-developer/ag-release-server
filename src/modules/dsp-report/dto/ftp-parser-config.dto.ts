import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
	IsArray,
	IsBoolean,
	IsEnum,
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

export enum FtpFieldMappingTransform {
	TRIM = 'trim',
	RAW = 'raw',
	UPPERCASE = 'uppercase',
	LOWERCASE = 'lowercase',
	ISRC = 'isrc',
}

export enum FtpFieldMappingTarget {
	SKIP = 'skip',
	METADATA = 'metadata',
	REPORTING_PERIOD = 'reporting_period',
	REPORTING_PERIOD_START = 'reporting_period_start',
	REPORTING_PERIOD_END = 'reporting_period_end',
	TERRITORY_CODE = 'territory_code',
	ISRC = 'isrc',
	UPC = 'upc',
	TRACK_TITLE = 'track_title',
	ARTIST_NAME = 'artist_name',
	ALBUM_TITLE = 'album_title',
	COMPOSER_NAME = 'composer_name',
	TRACK_ID_INTERNAL = 'track_id_internal',
	QUANTITY_TOTAL = 'quantity_total',
	QUANTITY_UNIQUE_USERS = 'quantity_unique_users',
	QUANTITY_INVALID = 'quantity_invalid',
	QUANTITY = 'quantity',
	QUANTITY_CREATIONS = 'quantity_creations',
	QUANTITY_VIEWS = 'quantity_views',
	REVENUE_USD = 'revenue_usd',
	REVENUE_LOCAL = 'revenue_local',
	REVENUE_CURRENCY = 'revenue_currency',
}

export class FtpParserFieldMappingDto {
	@ApiProperty({
		description: 'Exact column header in the source report file',
		example: 'ISRC',
	})
	@IsString()
	reportColumn: string;

	@ApiPropertyOptional({
		description:
			'Optional internal parser header to populate before parsing. Use the same value as reportColumn to apply only the target-field override without aliasing another parser input.',
		example: 'ISRC',
	})
	@IsOptional()
	@IsString()
	parserColumn?: string;

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

/** Multipart-friendly, one-row field mapping update. */
export class UpsertFtpParserFieldMappingDto {
	@ApiProperty({ example: 'ISRC' })
	@IsString()
	reportColumn: string;

	@ApiProperty({ enum: FtpFieldMappingTarget })
	@IsEnum(FtpFieldMappingTarget)
	targetColumn: FtpFieldMappingTarget;

	@ApiPropertyOptional({ description: 'Required only when targetColumn is metadata' })
	@IsOptional()
	@IsString()
	metadataKey?: string;

	@ApiPropertyOptional({ enum: FtpFieldMappingTransform, default: FtpFieldMappingTransform.TRIM })
	@IsOptional()
	@IsEnum(FtpFieldMappingTransform)
	transform?: FtpFieldMappingTransform;
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
