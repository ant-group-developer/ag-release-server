import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional } from 'class-validator';
import { TypeDateTimeline } from '../statistics.enum';

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

export class QueryGetOverviewCountDto extends BaseQueryStatisticsDto {
	@IsEnum(['audio', 'video'])
	@IsOptional()
	releaseType?: 'audio' | 'video';
}

export class QueryGetStreamCountByCountryDto extends BaseQueryStatisticsDto {
	@Type(() => Date)
	@IsOptional()
	@IsDate()
	startDate: Date;

	@Type(() => Date)
	@IsOptional()
	@IsDate()
	endDate: Date;

	@IsEnum(TypeDateTimeline)
	@IsOptional()
	typeGroup: TypeDateTimeline;
}
