import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
	IsBoolean,
	IsEnum,
	IsInt,
	IsOptional,
	IsString,
	Min,
} from 'class-validator';
import { BaseQueryDto2 } from 'src/common/dtos/common.base-query.dto';
import { DspDealVisibility, FieldOrderDspDeal } from '../enum/dsp-deal.enum';

export class CreateDspDealDto {
	// dspId + dealTypeId lấy từ param hoặc body đều được
	@IsString()
	dspId: string; // bigint string

	@IsString()
	dealTypeId: string; // bigint string

	@IsEnum(DspDealVisibility)
	visibility: DspDealVisibility;

	@IsOptional()
	@IsBoolean()
	enabled?: boolean;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	order?: number;
}

export class UpdateDspDealDto {
	@IsOptional()
	@IsEnum(DspDealVisibility)
	visibility?: DspDealVisibility;

	@IsOptional()
	@IsBoolean()
	enabled?: boolean;

	@IsOptional()
	@Type(() => Number)
	@IsInt()
	@Min(0)
	priority?: number;
}

export class GetListDspDealsDto extends BaseQueryDto2 {
	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	dspId?: string; // bigint string

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	dealTypeId?: string; // bigint string

	@ApiPropertyOptional({ enum: DspDealVisibility })
	@IsOptional()
	@IsEnum(DspDealVisibility)
	visibility?: DspDealVisibility;

	@ApiPropertyOptional()
	@IsOptional()
	@Type(() => Boolean)
	@IsBoolean()
	enabled?: boolean;

	// @IsEnum(FieldOrderDspDeal)
	@IsOptional()
	fieldOrder: string = FieldOrderDspDeal.createdAt;
}
