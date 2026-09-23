import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
	ArrayNotEmpty,
	IsArray,
	IsEnum,
	IsIn,
	IsOptional,
	IsString,
	IsUUID,
} from 'class-validator';
import { BaseQueryDto2 } from 'src/common/dtos/common.base-query.dto';
import { OrderDirection } from 'src/common/enums/common';
import { ReleaseReviewStatus } from '../entities/release-review.entity';

export enum FieldOrderReleaseReview {
	createdAt = 'releaseReview.createdAt',
	updatedAt = 'releaseReview.updatedAt',
	status = 'releaseReview.status',
}

const toArray = ({ value }: { value: unknown }) => {
	if (value === undefined || value === null || value === '') return undefined;
	return Array.isArray(value) ? value : [value];
};

export class CreateReleaseReviewDto {
	@IsUUID()
	releaseId: string;

	@IsOptional()
	@IsUUID()
	releaseExecutionId?: string | null;

	@IsOptional()
	@IsUUID()
	stepId?: string | null;

	@ApiPropertyOptional({ enum: ReleaseReviewStatus })
	@IsOptional()
	@IsEnum(ReleaseReviewStatus)
	status?: ReleaseReviewStatus;

	@IsOptional()
	@IsString()
	note?: string | null;
}

export class UpdateReleaseReviewDto {
	@IsOptional()
	@IsUUID()
	releaseExecutionId?: string;

	@ApiPropertyOptional({ enum: ReleaseReviewStatus })
	@IsOptional()
	@IsEnum(ReleaseReviewStatus)
	status?: ReleaseReviewStatus;

	@IsOptional()
	@IsString()
	note?: string | null;
}

export class UpdateReleaseReviewDecisionDto {
	@ApiProperty({
		enum: [ReleaseReviewStatus.COMPLETED, ReleaseReviewStatus.FAILED],
	})
	@IsIn([ReleaseReviewStatus.COMPLETED, ReleaseReviewStatus.FAILED])
	status: ReleaseReviewStatus.COMPLETED | ReleaseReviewStatus.FAILED;

	@IsOptional()
	@IsString()
	note?: string | null;
}
export class GetListReleaseReviewsDto extends BaseQueryDto2 {
	@ApiPropertyOptional({
		description: 'Release ID',
		type: String,
		format: 'uuid',
	})
	@IsOptional()
	@IsUUID()
	releaseId?: string;

	@ApiPropertyOptional({
		description: 'Release execution ID',
		type: String,
		format: 'uuid',
	})
	@IsOptional()
	@IsUUID()
	releaseExecutionId?: string;

	@ApiPropertyOptional({
		description: 'Review status',
		enum: ReleaseReviewStatus,
	})
	@IsOptional()
	@IsEnum(ReleaseReviewStatus)
	status?: ReleaseReviewStatus;

	@ApiPropertyOptional({
		description: 'List of release error IDs',
		type: [String],
		format: 'uuid',
		isArray: true,
		example: ['550e8400-e29b-41d4-a716-446655440000'],
	})
	@IsOptional()
	@Transform(toArray)
	@IsArray()
	@IsUUID(undefined, { each: true })
	releaseErrorIds?: string[];

	@ApiPropertyOptional({
		description: 'Field used to order release reviews',
		enum: FieldOrderReleaseReview,
		default: FieldOrderReleaseReview.createdAt,
	})
	@IsOptional()
	@IsEnum(FieldOrderReleaseReview)
	fieldOrder: FieldOrderReleaseReview = FieldOrderReleaseReview.createdAt;

	@ApiPropertyOptional({
		description: 'Order direction',
		enum: OrderDirection,
		default: OrderDirection.DESC,
	})
	@IsOptional()
	@IsEnum(OrderDirection)
	orderBy: OrderDirection = OrderDirection.DESC;
}

export class BulkUpdateReleaseReviewDecisionDto extends UpdateReleaseReviewDecisionDto {
	@ApiProperty({
		type: [String],
		format: 'uuid',
		description: 'Danh sách release cần approve hoặc reject',
	})
	@IsArray()
	@ArrayNotEmpty()
	@IsUUID('4', { each: true })
	releaseIds: string[];
}
