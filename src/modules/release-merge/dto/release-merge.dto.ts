import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
	IsArray,
	IsBoolean,
	IsEnum,
	IsOptional,
	IsUUID,
} from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/common.base-query.dto';
import {
	ReleaseMergeItemClassification,
	ReleaseMergeItemStatus,
} from '../enum/release-merge.enum';

const toBoolean = ({ value }: { value: unknown }): unknown => {
	if (typeof value === 'boolean') return value;
	if (value === 'true' || value === '1') return true;
	if (value === 'false' || value === '0') return false;
	return value;
};

export class QueryReleaseMergeItemDto extends BaseQueryDto {
	@ApiPropertyOptional({ enum: ReleaseMergeItemClassification })
	@IsOptional()
	@IsEnum(ReleaseMergeItemClassification)
	classification?: ReleaseMergeItemClassification;

	@ApiPropertyOptional({ enum: ReleaseMergeItemStatus })
	@IsOptional()
	@IsEnum(ReleaseMergeItemStatus)
	status?: ReleaseMergeItemStatus;

	@ApiPropertyOptional()
	@IsOptional()
	@IsUUID()
	targetReleaseId?: string;
}

export class ApplyReleaseMergeItemsDto {
	@ApiPropertyOptional({ default: false })
	@IsOptional()
	@Transform(toBoolean)
	@IsBoolean()
	selectAll: boolean = false;

	@ApiPropertyOptional({ type: [String] })
	@IsOptional()
	@IsArray()
	@IsUUID('4', { each: true })
	itemIds?: string[];

	@ApiPropertyOptional({ type: [String] })
	@IsOptional()
	@IsArray()
	@IsUUID('4', { each: true })
	excludeItemIds?: string[];

	@ApiPropertyOptional({
		description:
			'Force merge manual pairs that are blocked only by UPC_NOT_EQUIVALENT',
		default: false,
	})
	@IsOptional()
	@Transform(toBoolean)
	@IsBoolean()
	force: boolean = false;

	@ApiPropertyOptional({
		description: 'Retry các item FAILED trong lần apply trước',
		default: false,
	})
	@IsOptional()
	@Transform(toBoolean)
	@IsBoolean()
	retryFailed: boolean = false;
}
