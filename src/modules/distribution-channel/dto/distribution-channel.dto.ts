import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	IsEnum,
	IsNumber,
	IsOptional,
	IsString,
	IsUUID,
	ValidateNested,
} from 'class-validator';
import { BaseQueryDto2 } from 'src/common/dtos/common.base-query.dto';
import {
	// DspAgreementType,
	OrderFieldDistributionChannel,
} from '../enums/distribution-channel.enum';

export class DistributionChannelCredentialsDto {
	@IsString()
	host: string;

	@IsNumber()
	port: number;

	@IsString()
	username: string;

	@IsString()
	password: string;

	// @IsString()
	// path: string;
}

export class CreateDistributionChannelDto {
	@IsOptional()
	@IsUUID()
	id?: string;

	// @ApiPropertyOptional({
	// 	type: 'string',
	// 	format: 'uuid',
	// 	nullable: true,
	// })
	// @IsUUID()
	// @IsOptional()
	// tenantId: string | null;

	// @ApiPropertyOptional({
	// 	type: 'string',
	// 	nullable: true,
	// 	example: 'spotify',
	// })
	// @IsString()
	// @IsOptional()
	// dspId: string | null;

	@ApiPropertyOptional({
		type: 'string',
		format: 'uuid',
		nullable: true,
	})
	@IsUUID()
	@IsOptional()
	aggregatorId: string | null;

	// @ApiProperty({
	// 	enum: DistributionChannelProtocol,
	// 	example: DistributionChannelProtocol.SFTP,
	// })
	// @IsEnum(DistributionChannelProtocol)
	// protocol: DistributionChannelProtocol;

	@ApiProperty({
		type: () => DistributionChannelCredentialsDto,
	})
	@ValidateNested()
	@Type(() => DistributionChannelCredentialsDto)
	credentials: DistributionChannelCredentialsDto;

	// @ApiPropertyOptional({
	// 	type: 'boolean',
	// 	default: false,
	// })
	// @IsBoolean()
	// @IsOptional()
	// isSystemDefault?: boolean;

	// @ApiPropertyOptional({
	// 	type: 'boolean',
	// 	default: true,
	// })
	// @IsBoolean()
	// @IsOptional()
	// isActive?: boolean;

	// @IsEnum(DspAgreementType)
	// agreementType: DspAgreementType;
}

export class UpdateDistributionChannelDto extends PartialType(
	CreateDistributionChannelDto,
) {}

export class GetListDistributionChannelsDto extends BaseQueryDto2 {
	// @ApiPropertyOptional({
	// 	type: 'string',
	// 	format: 'uuid',
	// })
	// @IsUUID()
	// @IsOptional()
	// tenantId?: string;

	// @ApiPropertyOptional({
	// 	type: 'string',
	// 	example: 'spotify',
	// })
	// @IsString()
	// @IsOptional()
	// dspId?: string;

	@ApiPropertyOptional({
		enum: OrderFieldDistributionChannel,
		default: OrderFieldDistributionChannel.UPDATED_AT,
	})
	@IsEnum(OrderFieldDistributionChannel)
	fieldOrder: OrderFieldDistributionChannel =
		OrderFieldDistributionChannel.UPDATED_AT;
}
