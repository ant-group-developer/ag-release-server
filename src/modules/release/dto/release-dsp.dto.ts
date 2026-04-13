// dto/release-dsp-delivery.dto.ts
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	IsArray,
	IsEnum,
	IsOptional,
	IsString,
	IsUUID,
	ValidateNested,
} from 'class-validator';
import { BaseQueryDto2 } from 'src/common/dtos/common.base-query.dto';
import {
	OrderFieldReleaseDspDelivery,
	ReleaseDspStatus,
} from '../enum/release-dsp.enum';

export class CreateReleaseDspDeliveryDto {
	@ApiProperty({ type: 'string', format: 'uuid' })
	@IsUUID()
	releaseId: string;

	@ApiProperty({ type: 'string', example: 'spotify' })
	@IsString()
	dspId: string;

	@ApiPropertyOptional({ enum: ReleaseDspStatus })
	@IsEnum(ReleaseDspStatus)
	@IsOptional()
	status?: ReleaseDspStatus;

	@ApiPropertyOptional({ type: 'boolean' })
	@IsOptional()
	isSelected?: boolean;
}

export class UpdateReleaseDspDeliveryDto extends PartialType(
	CreateReleaseDspDeliveryDto,
) {}

export class BulkUpdateReleaseDspDeliveryItemDto extends UpdateReleaseDspDeliveryDto {
	@ApiProperty({ type: 'string', format: 'uuid' })
	@IsUUID()
	id: string;
}

export class BulkUpdateReleaseDspDeliveryDto {
	@ApiProperty({ type: [BulkUpdateReleaseDspDeliveryItemDto] })
	@IsArray()
	@ValidateNested({ each: true })
	@Type(() => BulkUpdateReleaseDspDeliveryItemDto)
	items: BulkUpdateReleaseDspDeliveryItemDto[];
}

export class GetListReleaseDspDeliveriesDto extends BaseQueryDto2 {
	@ApiPropertyOptional({ type: 'string', format: 'uuid' })
	@IsUUID()
	@IsOptional()
	releaseId?: string;

	@ApiPropertyOptional({ type: 'string', example: 'spotify' })
	@IsString()
	@IsOptional()
	dspId?: string;

	@ApiPropertyOptional({ enum: ReleaseDspStatus })
	@IsEnum(ReleaseDspStatus)
	@IsOptional()
	status?: ReleaseDspStatus;

	@ApiPropertyOptional({ enum: OrderFieldReleaseDspDelivery })
	@IsOptional()
	fieldOrder: OrderFieldReleaseDspDelivery =
		OrderFieldReleaseDspDelivery.releaseDspDelivery_updatedAt;
}
