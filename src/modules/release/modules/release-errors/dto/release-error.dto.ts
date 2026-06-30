import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	ArrayMinSize,
	IsArray,
	IsEnum,
	IsNotEmpty,
	IsOptional,
	IsString,
	IsUUID,
	ValidateNested,
} from 'class-validator';
import { BaseQueryDto2 } from 'src/common/dtos/common.base-query.dto';
import { OrderDirection } from 'src/common/enums/common';
import {
	ErrorApprovalStatus,
	ErrorSubmissionStatus,
	ReleaseErrorType,
} from '../entities/release-error.entity';

export enum FieldOrderReleaseError {
	createdAt = 'releaseError.createdAt',
	updatedAt = 'releaseError.updatedAt',
	message = 'releaseError.message',
	messageCode = 'releaseError.messageCode',
	type = 'releaseError.type',
	submissionStatus = 'releaseError.submissionStatus',
	approvalStatus = 'releaseError.approvalStatus',
}

export class CreateReleaseErrorDto {
	@IsUUID()
	releaseId: string;

	@IsOptional()
	@IsEnum(ErrorSubmissionStatus)
	submissionStatus?: ErrorSubmissionStatus;

	@IsOptional()
	@IsEnum(ErrorApprovalStatus)
	approvalStatus?: ErrorApprovalStatus;

	@IsOptional()
	@IsUUID()
	releaseExecutionId?: string;

	@IsOptional()
	@IsUUID()
	stepId?: string;

	@IsOptional()
	@IsUUID()
	releaseReviewId?: string;

	@IsOptional()
	@IsString()
	messageCode?: string;

	@IsString()
	@IsNotEmpty()
	message: string;

	@IsOptional()
	@IsString()
	page?: string;

	@IsOptional()
	@IsString()
	field?: string;

	@IsOptional()
	@IsUUID()
	trackId?: string;

	@IsOptional()
	@IsEnum(ReleaseErrorType)
	type?: ReleaseErrorType | null;
}

export class BulkCreateReleaseErrorsDto {
	@IsArray()
	@ArrayMinSize(1)
	@ValidateNested({ each: true })
	@Type(() => CreateReleaseErrorDto)
	items: CreateReleaseErrorDto[];
}

export class UpdateReleaseErrorDto {
	@IsUUID()
	id: string;

	@IsOptional()
	@IsEnum(ErrorSubmissionStatus)
	submissionStatus?: ErrorSubmissionStatus;

	@IsOptional()
	@IsEnum(ErrorApprovalStatus)
	approvalStatus?: ErrorApprovalStatus;

	// @IsOptional()
	// @IsUUID()
	// releaseExecutionId?: string;

	// @IsOptional()
	// @IsUUID()
	// stepId?: string;

	// @IsOptional()
	// @IsUUID()
	// releaseReviewId?: string;

	// @IsOptional()
	// @IsString()
	// messageCode?: string;

	// @IsOptional()
	// @IsString()
	// message?: string;

	// @IsOptional()
	// @IsString()
	// page?: string;

	// @IsOptional()
	// @IsString()
	// field?: string;

	// @IsOptional()
	// @IsUUID()
	// trackId?: string;

	// @IsOptional()
	// @IsEnum(ReleaseErrorType)
	// type?: ReleaseErrorType | null;
}

export class BulkUpdateReleaseErrorsDto {
	@IsArray()
	@ArrayMinSize(1)
	@ValidateNested({ each: true })
	@Type(() => UpdateReleaseErrorDto)
	items: UpdateReleaseErrorDto[];
}

export class GetListReleaseErrorsDto extends BaseQueryDto2 {
	@ApiPropertyOptional({ type: 'string' })
	@IsOptional()
	@IsUUID()
	releaseId?: string;

	@ApiPropertyOptional({ enum: ReleaseErrorType, nullable: true })
	@IsOptional()
	@IsEnum(ReleaseErrorType)
	type?: ReleaseErrorType;

	@ApiPropertyOptional({ enum: ErrorSubmissionStatus })
	@IsOptional()
	@IsEnum(ErrorSubmissionStatus)
	submissionStatus?: ErrorSubmissionStatus;

	@ApiPropertyOptional({ enum: ErrorApprovalStatus })
	@IsOptional()
	@IsEnum(ErrorApprovalStatus)
	approvalStatus?: ErrorApprovalStatus;

	@IsOptional()
	@IsString()
	messageCode?: string;

	@IsOptional()
	@IsUUID()
	releaseExecutionId?: string;

	@IsOptional()
	@IsUUID()
	stepId?: string;

	@IsOptional()
	@IsUUID()
	releaseReviewId?: string;

	@IsOptional()
	@IsEnum(FieldOrderReleaseError)
	fieldOrder: FieldOrderReleaseError = FieldOrderReleaseError.createdAt;

	@IsOptional()
	@IsEnum(OrderDirection)
	orderBy: OrderDirection = OrderDirection.DESC;
}
