import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
	IsArray,
	IsEnum,
	IsInt,
	IsNotEmpty,
	IsOptional,
	IsString,
	Min,
} from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/common.base-query.dto';

export enum ReportType {
	SALES = 'sales',
	TRENDS = 'trends',
	USAGE = 'usage',
}

export class CreateReportSourceConfigDto {
	@ApiProperty({
		description:
			'Unique identifier for the report source (e.g. wmg, spotify)',
		example: 'wmg',
	})
	@IsNotEmpty()
	@IsString()
	sourceCode: string;

	@ApiProperty({
		description: 'Name of the report source',
		example: 'Warner Music Group',
	})
	@IsNotEmpty()
	@IsString()
	sourceName: string;

	@ApiProperty({
		description: 'Type of report',
		enum: ReportType,
		example: 'sales',
	})
	@IsNotEmpty()
	@IsEnum(ReportType)
	reportType: 'sales' | 'trends' | 'usage';

	@ApiPropertyOptional({
		description: 'Regex pattern array for matching folders',
		type: [String],
		example: [],
	})
	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	folderPatterns?: string[] = [];

	@ApiProperty({
		description: 'Regex pattern array for matching file names',
		type: [String],
		example: ['\\d+_\\d{6}_\\d{6}_\\d+_DTL\\.csv$'],
	})
	@IsNotEmpty()
	@IsArray()
	@IsString({ each: true })
	filePatterns: string[];

	@ApiProperty({
		description: 'Headers that are required in the report file',
		type: [String],
		example: ['GPID', 'ISRC'],
	})
	@IsNotEmpty()
	@IsArray()
	@IsString({ each: true })
	requiredHeaders: string[];

	@ApiProperty({
		description: 'Code for the parser to process the file',
		example: 'wmg-sales',
	})
	@IsNotEmpty()
	@IsString()
	parserCode: string;

	@ApiPropertyOptional({
		description: 'Delimiter used in the CSV/text file',
		default: ',',
		example: ',',
	})
	@IsOptional()
	@IsString()
	delimiter?: string = ',';

	@ApiPropertyOptional({
		description: 'Default currency code (e.g. USD)',
		default: '',
		example: 'USD',
	})
	@IsOptional()
	@IsString()
	defaultCurrency?: string = '';

	@ApiPropertyOptional({
		description: 'Default member reference',
		default: '',
		example: '',
	})
	@IsOptional()
	@IsString()
	defaultMember?: string = '';

	@ApiPropertyOptional({
		description: 'Priority of config matching (lower = higher priority)',
		default: 100,
		example: 1,
	})
	@IsOptional()
	@IsInt()
	@Min(1)
	priority?: number = 100;
}

export class UpdateReportSourceConfigDto extends PartialType(
	CreateReportSourceConfigDto,
) {}

export class QueryGetListReportSourceConfigDto extends BaseQueryDto {}
