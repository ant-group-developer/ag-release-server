import { PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	ArrayMinSize,
	IsEnum,
	IsInt,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	MaxLength,
	Min,
	ValidateNested,
} from 'class-validator';
import {
	DEFAULT_LENGTH_CODE,
	DEFAULT_LENGTH_COLOR,
	DEFAULT_LENGTH_NAME,
	DEFAULT_LENGTH_NOTE,
} from 'src/common/constants/common.default.constants';
import { BaseQueryDto } from 'src/common/dtos/common.base-query.dto';
import { FieldOrderIssueLevel } from '../enum/issue-level.enum';

export class CreateIssueLevelDto {
	@IsString()
	@MaxLength(DEFAULT_LENGTH_NAME)
	@IsNotEmpty()
	nameVi: string;

	@IsString()
	@MaxLength(DEFAULT_LENGTH_NAME)
	@IsNotEmpty()
	nameEn: string;

	@IsString()
	@MaxLength(DEFAULT_LENGTH_CODE)
	@IsNotEmpty()
	code: string;

	@IsString()
	@MaxLength(DEFAULT_LENGTH_COLOR)
	@IsNotEmpty()
	color: string;

	@IsInt()
	@IsOptional()
	severityRank?: number;

	@IsOptional()
	weight?: number;

	@IsString()
	@MaxLength(DEFAULT_LENGTH_NOTE)
	@IsOptional()
	note?: string;
}

export class UpdateIssueLevelDto extends PartialType(CreateIssueLevelDto) {}

export class QueryGetListIssueLevelDto extends BaseQueryDto {
	@IsEnum(FieldOrderIssueLevel)
	@IsOptional()
	fieldOrder: FieldOrderIssueLevel = FieldOrderIssueLevel.SEVERITY_RANK;
}

export class UpdateIssueLevelOrderDto {
	@IsInt()
	@IsNotEmpty()
	order: number;
}

class UpdateSeverityRankIssueLevel {
	@IsUUID()
	@IsNotEmpty()
	id: string;

	@IsInt()
	@IsNotEmpty()
	@Min(0)
	severityRank: number;
}

export class BulkUpdateIssueLevel {
	@IsNotEmpty()
	@ArrayMinSize(1)
	@ValidateNested({ each: true })
	@Type(() => UpdateSeverityRankIssueLevel)
	issueLevels: UpdateSeverityRankIssueLevel[];
}
