import { Type } from 'class-transformer';
import { IsDate, IsOptional } from 'class-validator';

export class BaseQueryStatisticsDto {
	@Type(() => Date)
	@IsOptional()
	@IsDate()
	startDate: Date;

	@Type(() => Date)
	@IsOptional()
	@IsDate()
	endDate: Date;
}

export class QueryGetIssueCountDto extends BaseQueryStatisticsDto {}

export class QueryGetOverviewCountDto extends BaseQueryStatisticsDto {}

export class QueryGetStreamCountByCountryDto extends BaseQueryStatisticsDto {
	@Type(() => Date)
	@IsOptional()
	@IsDate()
	startDate: Date;

	@Type(() => Date)
	@IsOptional()
	@IsDate()
	endDate: Date;

	typeGroup: 'day' | 'month' | 'year';
}
