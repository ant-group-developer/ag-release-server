import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsObject, IsOptional, IsString } from 'class-validator';
import { BaseQueryDto2 } from 'src/common/dtos/common.base-query.dto';
import {
	DspDealConfigScope,
	DspDealConfigStatus,
} from '../enum/dsp-deal-config.enum';

export class CreateDspDealConfigDto {
	@IsString()
	dspId: string;

	@IsString()
	dealTypeId: string;

	@IsOptional()
	@IsString()
	userId?: string | null;

	@IsEnum(DspDealConfigScope)
	scope: DspDealConfigScope;

	@IsObject()
	configJson: Record<string, any>;

	@IsOptional()
	@IsEnum(DspDealConfigStatus)
	status?: DspDealConfigStatus;
}

export class UpdateDspDealConfigDto {
	@IsOptional()
	@IsObject()
	configJson?: Record<string, any>;

	@IsOptional()
	@IsEnum(DspDealConfigStatus)
	status?: DspDealConfigStatus;
}

export class GetListDspDealConfigsDto extends BaseQueryDto2 {
	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	dspId?: string;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	dealTypeId?: string;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	userId?: string;

	@ApiPropertyOptional({ enum: DspDealConfigScope })
	@IsOptional()
	@IsEnum(DspDealConfigScope)
	scope?: DspDealConfigScope;

	@ApiPropertyOptional({ enum: DspDealConfigStatus })
	@IsOptional()
	@IsEnum(DspDealConfigStatus)
	status?: DspDealConfigStatus;
}
