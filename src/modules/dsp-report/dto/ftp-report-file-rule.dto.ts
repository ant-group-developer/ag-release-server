import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { FtpSourceCategory } from './ftp-parser-config.dto';

export enum FtpReportFileRuleStatus {
	PENDING = 'pending',
	IMPORT = 'import',
	IGNORE = 'ignore',
}

export class UpsertFtpReportFileRuleDto {
	@ApiProperty({ example: 'ftp' })
	@IsString()
	source: string;

	@ApiProperty({ enum: FtpSourceCategory })
	@IsEnum(FtpSourceCategory)
	sourceCategory: FtpSourceCategory;

	@ApiProperty({ example: '^fbk-facebook$' })
	@IsString()
	dspFolderPattern: string;

	@ApiProperty({ example: '^MERLIN_DAILY_TOP_1K_\\d{8}\\.csv$' })
	@IsString()
	fileNamePattern: string;

	@ApiProperty({ enum: FtpReportFileRuleStatus })
	@IsEnum(FtpReportFileRuleStatus)
	status: FtpReportFileRuleStatus;

	@ApiPropertyOptional({ description: 'Required when status is import. Send an empty string in PATCH to explicitly clear it.' })
	@IsOptional()
	@IsString()
	parserCode?: string;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	description?: string;
}

export class UpdateFtpReportFileRuleDto extends PartialType(UpsertFtpReportFileRuleDto) {}

export class QueryFtpReportFileRulesDto {
	@ApiPropertyOptional({ example: 'ftp' })
	@IsOptional()
	@IsString()
	source?: string;

	@ApiPropertyOptional({ enum: FtpSourceCategory })
	@IsOptional()
	@IsEnum(FtpSourceCategory)
	sourceCategory?: FtpSourceCategory;

	@ApiPropertyOptional({ enum: FtpReportFileRuleStatus })
	@IsOptional()
	@IsEnum(FtpReportFileRuleStatus)
	status?: FtpReportFileRuleStatus;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	dspFolder?: string;

	@ApiPropertyOptional({ default: 1 })
	@IsOptional()
	@Transform(({ value }) => Number(value))
	page?: number = 1;

	@ApiPropertyOptional({ default: 50 })
	@IsOptional()
	@Transform(({ value }) => Number(value))
	pageSize?: number = 50;
}
