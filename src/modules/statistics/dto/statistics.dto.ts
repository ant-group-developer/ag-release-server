import { IsDate, IsNotEmpty, IsOptional } from 'class-validator';

class BaseQueryStatisticsDto {
	@IsOptional()
	@IsDate()
	startDate: Date;

	@IsOptional()
	@IsDate()
	endDate: Date;
}

export class QueryGetIssueCountDto extends BaseQueryStatisticsDto {}

export class QueryGetOverviewCountDto extends BaseQueryStatisticsDto {}

export class QueryGetStreamCountByCountryDto extends BaseQueryStatisticsDto {
	@IsNotEmpty()
	@IsDate()
	startDate: Date;

	@IsNotEmpty()
	@IsDate()
	endDate: Date;

	typeGroup: 'day' | 'month' | 'year';
}
