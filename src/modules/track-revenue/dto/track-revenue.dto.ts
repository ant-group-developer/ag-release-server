import { IsOptional } from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';

export class QueryGetListTrackRevenueDto extends BaseQueryDto {
	@IsOptional()
	dspId?: string;

	@IsOptional()
	releaseId?: string;

	@IsOptional()
	trackId?: string;
}
