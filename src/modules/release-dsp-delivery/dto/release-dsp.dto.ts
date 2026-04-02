// dto/release-dsp-delivery.dto.ts
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { BaseQueryDto2 } from 'src/common/dtos/common.base-query.dto';
import { ReleaseDspStatus } from '../enum/release-dsp.enum';

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

export enum OrderFieldReleaseDspDelivery {
	CREATED_AT = 'createdAt',
	UPDATED_AT = 'updatedAt',
	RELEASE_ID = 'releaseId',
	DSP_ID = 'dspId',
	STATUS = 'status',
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
		OrderFieldReleaseDspDelivery.UPDATED_AT;
}
