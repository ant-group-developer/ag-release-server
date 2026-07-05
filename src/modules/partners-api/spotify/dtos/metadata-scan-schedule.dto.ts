import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
	IsBoolean,
	IsInt,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	MaxLength,
	Min,
} from 'class-validator';
import {
	MetadataScanTriggerType,
	ScanSessionStatus,
} from 'src/modules/release/entities/metadata-scan-session.entity';

function parseOptionalBoolean(value: unknown): boolean | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	if (value === true || value === 'true') return true;
	if (value === false || value === 'false') return false;
	return value as boolean;
}

export class CreateMetadataScanScheduleDto {
	@ApiProperty({ example: 'Report import morning' })
	@IsString()
	@IsNotEmpty()
	@MaxLength(120)
	name: string;

	@ApiPropertyOptional({ example: true, default: true })
	@IsOptional()
	@IsBoolean()
	enabled?: boolean;

	@ApiProperty({ example: '0 2 * * *' })
	@IsString()
	@IsNotEmpty()
	@MaxLength(100)
	cronExpression: string;

	@ApiPropertyOptional({
		example: 'Asia/Ho_Chi_Minh',
		default: 'Asia/Ho_Chi_Minh',
	})
	@IsOptional()
	@IsString()
	@MaxLength(80)
	timezone?: string;

	@ApiProperty({
		example: true,
		description:
			'true: report-import enrichment, false: links-only enrichment',
	})
	@IsBoolean()
	isImportedFromReport: boolean;

	@ApiPropertyOptional({ example: 500, default: 500, nullable: true })
	@IsOptional()
	@IsInt()
	@Min(1)
	limitCount?: number | null;

	@ApiPropertyOptional({ example: false, default: false })
	@IsOptional()
	@IsBoolean()
	force?: boolean;
}

export class UpdateMetadataScanScheduleDto extends PartialType(
	CreateMetadataScanScheduleDto,
) {}

export class QueryMetadataScanSessionsDto {
	@ApiPropertyOptional({ example: 1 })
	@IsOptional()
	@Transform(({ value }) => (value ? parseInt(value, 10) : 1))
	@IsInt()
	@Min(1)
	page?: number;

	@ApiPropertyOptional({ example: 10 })
	@IsOptional()
	@Transform(({ value }) => (value ? parseInt(value, 10) : 10))
	@IsInt()
	@Min(1)
	pageSize?: number;

	@ApiPropertyOptional({ format: 'uuid' })
	@IsOptional()
	@IsUUID()
	scheduleId?: string;

	@ApiPropertyOptional({ enum: MetadataScanTriggerType })
	@IsOptional()
	@IsString()
	triggerType?: MetadataScanTriggerType;

	@ApiPropertyOptional({ enum: ScanSessionStatus })
	@IsOptional()
	@IsString()
	status?: ScanSessionStatus;

	@ApiPropertyOptional({ type: Boolean })
	@IsOptional()
	@Transform(({ value }) => parseOptionalBoolean(value))
	@IsBoolean()
	isImportedFromReport?: boolean;
}
