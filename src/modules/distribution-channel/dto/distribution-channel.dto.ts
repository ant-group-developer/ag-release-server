// dto/distribution-channel.dto.ts
import { ApiProperty, PartialType } from '@nestjs/swagger';
import {
	IsBoolean,
	IsEnum,
	IsNotEmpty,
	IsObject,
	IsOptional,
	IsString,
	IsUUID,
} from 'class-validator';
import { BaseQueryDto2 } from 'src/common/dtos/common.base-query.dto';
import { OrderFieldDistributionChannel } from '../enums/distribution-channel.enum';

export class CreateDistributionChannelDto {
	@ApiProperty()
	@IsUUID()
	@IsOptional()
	tenantId: string | null;

	@ApiProperty()
	@IsString()
	@IsOptional()
	dspId: string | null;

	@ApiProperty({ required: false, nullable: true })
	@IsUUID()
	@IsOptional()
	aggregatorId: string | null;

	@ApiProperty({ example: 'SFTP' })
	@IsString()
	@IsNotEmpty()
	protocol: string;

	@ApiProperty({ type: Object })
	@IsObject()
	@IsNotEmpty()
	credentials: Record<string, any>;

	@ApiProperty({ required: false })
	@IsBoolean()
	@IsOptional()
	isSystemDefault?: boolean;

	@ApiProperty({ required: false })
	@IsBoolean()
	@IsOptional()
	isActive?: boolean;
}

export class UpdateDistributionChannelDto extends PartialType(
	CreateDistributionChannelDto,
) {}

export class GetListDistributionChannelsDto extends BaseQueryDto2 {
	@IsUUID()
	@IsOptional()
	tenantId?: string;

	@IsString()
	@IsOptional()
	dspId?: string;

	@IsEnum(OrderFieldDistributionChannel)
	fieldOrder: OrderFieldDistributionChannel =
		OrderFieldDistributionChannel.UPDATED_AT;
}
