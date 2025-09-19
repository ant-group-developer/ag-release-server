import { PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
	IsBoolean,
	IsDateString,
	IsEnum,
	IsInt,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	MaxLength,
	Min,
} from 'class-validator';
import { DEFAULT_LENGTH_NOTE } from 'src/common/constants/common.default.constants';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';
import { FieldOrderTenantIssue } from '../enum/tenant-issue.enum';

export class CreateTenantIssueDto {
	@IsInt()
	@IsOptional()
	@Min(0)
	score?: number;

	@IsDateString()
	@IsOptional()
	startDateAffect?: Date;

	@IsDateString()
	@IsOptional()
	endDateAffect?: Date;

	@IsBoolean()
	@IsOptional()
	isActive?: boolean;

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
	tenantId: string;

	@IsUUID()
	@IsNotEmpty()
	issueId: string;
}

export class UpdateTenantIssueDto extends PartialType(CreateTenantIssueDto) {}

export class QueryGetListTenantIssueDto extends BaseQueryDto {
	@IsEnum(FieldOrderTenantIssue)
	@IsOptional()
	fieldOrder: FieldOrderTenantIssue = FieldOrderTenantIssue.CREATED_AT;

	@IsUUID('4', { each: true })
	@IsOptional()
	@Transform(({ value }) =>
		value
			? String(value)
					.split(',')
					.map((v) => v.trim())
			: [],
	)
	issueLevelId?: string[];
}
