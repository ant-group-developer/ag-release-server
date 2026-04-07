import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/common.base-query.dto';
import { ReleaseDspStatus } from 'src/modules/release/enum/release-dsp.enum';
export class ReleaseQueryDspDeliveryDto extends BaseQueryDto {
	@ApiPropertyOptional({
		example: 'processing',
		description: 'Lọc theo trạng thái DSP delivery',
	})
	@IsOptional()
	@IsString()
	status?: ReleaseDspStatus;
}
