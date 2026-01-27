// src/modules/distribution/dsp-routing/dto/dsp-routing.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { BaseQueryDto2 } from 'src/common/dtos/common.base-query.dto';
import { FieldOrderDspRouting } from '../enum/dsp-routing.enum';

export class CreateDspRoutingSettingDto {
	@ApiProperty({ example: 'dsp_001' })
	@IsString()
	dspId: string;

	// @ApiPropertyOptional({
	// 	example: RoutingModeEnum.AGGREGATOR,
	// 	enum: RoutingModeEnum,
	// 	default: RoutingModeEnum.AGGREGATOR,
	// })
	// @IsOptional()
	// @IsEnum(RoutingModeEnum)
	// mode?: RoutingModeEnum;

	/**
	 * mode=DIRECT -> REQUIRED directConfigId
	 */
	@ApiPropertyOptional({ example: 'b2f4c2c1-2d2c-4f9b-9f9a-1f2b3c4d5e6f' })
	@IsOptional()
	@IsUUID()
	directConfigId?: string | null;

	/**
	 * mode=AGGREGATOR -> OPTIONAL override configId
	 */
	@ApiPropertyOptional({ example: 'b2f4c2c1-2d2c-4f9b-9f9a-1f2b3c4d5e6f' })
	@IsOptional()
	@IsUUID()
	specificAggregatorConfigId?: string | null;
}

export class UpdateDspRoutingSettingDto {
	// @ApiPropertyOptional({
	// 	example: RoutingModeEnum.AGGREGATOR,
	// 	enum: RoutingModeEnum,
	// })
	// @IsOptional()
	// @IsEnum(RoutingModeEnum)
	// mode?: RoutingModeEnum;

	@ApiPropertyOptional({ example: 'b2f4c2c1-2d2c-4f9b-9f9a-1f2b3c4d5e6f' })
	@IsOptional()
	@IsUUID()
	directConfigId?: string | null;

	@ApiPropertyOptional({ example: 'b2f4c2c1-2d2c-4f9b-9f9a-1f2b3c4d5e6f' })
	@IsOptional()
	@IsUUID()
	specificAggregatorConfigId?: string | null;
}

export class GetListDspRoutingSettingsDto extends BaseQueryDto2 {
	@ApiPropertyOptional({ example: 'dsp_001' })
	@IsOptional()
	@IsString()
	dspId?: string;

	// @ApiPropertyOptional({
	// 	example: RoutingModeEnum.AGGREGATOR,
	// 	enum: RoutingModeEnum,
	// })
	// @IsOptional()
	// @IsEnum(RoutingModeEnum)
	// mode?: RoutingModeEnum;

	@IsOptional()
	fieldOrder: string = FieldOrderDspRouting.createdAt;
}

export class AutoCreateDspRoutingSettingDto {
	@ApiPropertyOptional({
		description: 'Use DIRECT mode when provided',
		example: 'b2f4c2c1-2d2c-4f9b-9f9a-1f2b3c4d5e6f',
	})
	@IsOptional()
	@IsUUID()
	directConfigId?: string | null;

	@ApiPropertyOptional({
		description: 'Use AGGREGATOR mode when provided',
		example: 'b2f4c2c1-2d2c-4f9b-9f9a-1f2b3c4d5e6f',
	})
	@IsOptional()
	@IsUUID()
	specificAggregatorConfigId?: string | null;
}
