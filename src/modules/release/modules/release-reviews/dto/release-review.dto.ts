import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsArray, IsEnum, IsOptional, IsUUID } from 'class-validator';
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
	releaseExecutionId?: string;

	@ApiPropertyOptional({ enum: ReleaseReviewStatus })
	@IsOptional()
	@IsEnum(ReleaseReviewStatus)
	status?: ReleaseReviewStatus;
}

export class UpdateReleaseReviewDto {
	@IsOptional()
	@IsUUID()
	releaseExecutionId?: string;

	@ApiPropertyOptional({ enum: ReleaseReviewStatus })
	@IsOptional()
	@IsEnum(ReleaseReviewStatus)
	status?: ReleaseReviewStatus;
}

export class GetListReleaseReviewsDto extends BaseQueryDto2 {
	@IsOptional()
	@IsUUID()
	releaseId?: string;

	@IsOptional()
	@IsUUID()
	releaseExecutionId?: string;

	@ApiPropertyOptional({ enum: ReleaseReviewStatus })
	@IsOptional()
	@IsEnum(ReleaseReviewStatus)
	status?: ReleaseReviewStatus;

	@IsOptional()
	@Transform(toArray)
	@IsArray()
	@IsUUID(undefined, { each: true })
	releaseErrorIds?: string[];

	@IsOptional()
	@IsEnum(FieldOrderReleaseReview)
	fieldOrder: FieldOrderReleaseReview = FieldOrderReleaseReview.createdAt;

	@IsOptional()
	@IsEnum(OrderDirection)
	orderBy: OrderDirection = OrderDirection.DESC;
}
