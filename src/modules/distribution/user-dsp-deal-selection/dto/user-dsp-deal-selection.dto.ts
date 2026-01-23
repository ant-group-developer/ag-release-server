import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { BaseQueryDto2 } from 'src/common/dtos/common.base-query.dto';
import { UserDspDealSelectionMode } from '../enum/user-dsp-deal-selection.enum';

export class CreateUserDspDealSelectionDto {
	@IsString()
	userId: string;

	@IsString()
	dspId: string;

	@IsString()
	dealTypeId: string;

	@IsEnum(UserDspDealSelectionMode)
	mode: UserDspDealSelectionMode;

	@IsOptional()
	@IsString()
	overrideConfigId?: string | null;
}

export class UpdateUserDspDealSelectionDto {
	@IsOptional()
	@IsString()
	dealTypeId?: string;

	@IsOptional()
	@IsEnum(UserDspDealSelectionMode)
	mode?: UserDspDealSelectionMode;

	@IsOptional()
	@IsString()
	overrideConfigId?: string | null;
}

export class GetListUserDspDealSelectionDto extends BaseQueryDto2 {
	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	userId?: string;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	dspId?: string;

	@ApiPropertyOptional()
	@IsOptional()
	@IsString()
	dealTypeId?: string;

	@ApiPropertyOptional({ enum: UserDspDealSelectionMode })
	@IsOptional()
	@IsEnum(UserDspDealSelectionMode)
	mode?: UserDspDealSelectionMode;
}
