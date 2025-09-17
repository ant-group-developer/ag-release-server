import { PartialType } from '@nestjs/swagger';
import {
	IsEnum,
	IsInt,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	MaxLength,
	Min,
} from 'class-validator';
import {
	DEFAULT_LENGTH_CODE,
	DEFAULT_LENGTH_NAME,
	DEFAULT_LENGTH_NOTE,
} from 'src/common/constants/common.default.constants';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';
import { FieldOrderIssue } from '../enum/issue.enum';

export class CreateIssueDto {
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

	@IsInt()
	@IsOptional()
	@Min(0)
	score?: number;

	@IsInt()
	@IsOptional()
	@Min(0)
	numberOfDaysAffect?: number;

	@IsString()
	@MaxLength(DEFAULT_LENGTH_NOTE)
	@IsOptional()
	description?: string;

	@IsString()
	@MaxLength(DEFAULT_LENGTH_NOTE)
	@IsOptional()
	note?: string;

	@IsUUID()
	@IsNotEmpty()
	issueLevelId: string;
}

export class UpdateIssueDto extends PartialType(CreateIssueDto) {}

export class QueryGetListIssueDto extends BaseQueryDto {
	@IsOptional()
	@IsEnum(FieldOrderIssue)
	fieldOrder: FieldOrderIssue = FieldOrderIssue.ISSUE_LEVEL;
}
