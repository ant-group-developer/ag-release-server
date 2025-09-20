import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsUUID, Length } from 'class-validator';
import { BaseQueryDto } from 'src/common/dtos/base-query.dto';
import { FieldOrderTrackRevenue } from '../enum/track-revenue.enum';

export class QueryGetListTrackRevenueDto extends BaseQueryDto {
	@IsOptional()
	@Transform(({ value }) =>
		value
			? String(value)
					.split(',')
					.map((v) => v.trim())
			: [],
	)
	@Length(10, 10, { each: true })
	dspId?: string[];

	@IsOptional()
	@Transform(({ value }) =>
		value
			? String(value)
					.split(',')
					.map((v) => v.trim())
			: [],
	)
	@IsUUID('4', { each: true })
	releaseId?: string[];

	@IsOptional()
	@Transform(({ value }) =>
		value
			? String(value)
					.split(',')
					.map((v) => v.trim())
			: [],
	)
	@Length(10, 10, { each: true })
	trackId?: string[];

	@IsOptional()
	@IsEnum(FieldOrderTrackRevenue)
	fieldOrder: FieldOrderTrackRevenue = FieldOrderTrackRevenue.REPORT_DATE;
}
