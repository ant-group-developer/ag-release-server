import { Controller, Get, Query } from '@nestjs/common';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import {
	QueryGetIssueCountDto,
	QueryGetOverviewCountDto,
	QueryGetStreamCountByCountryDto,
} from './dto/statistics.dto';
import { StatisticsService } from './services/statistics.service';

@Controller('statistics')
export class StatisticsController {
	constructor(private readonly statisticsService: StatisticsService) {}

	@Get('issues/count')
	async getIssueCounts(@Query() query: QueryGetIssueCountDto) {
		const data = await this.statisticsService.getIssueCounts(query);
		return new ResponseSuccess({ data });
	}

	@Get('overview/count')
	async getOverviewCounts(@Query() query: QueryGetOverviewCountDto) {
		const data = await this.statisticsService.getOverviewCounts(query);
		return new ResponseSuccess({ data });
	}

	// stream
	@Get('stream/count/by-country')
	async getStreamCountsByCountry(
		@Query() query: QueryGetStreamCountByCountryDto,
	) {
		const data =
			await this.statisticsService.getStreamCountsByCountry(query);
		return new ResponseSuccess({ data });
	}

	@Get('stream/count/by-date')
	async getStreamCountsByDate(
		@Query() query: QueryGetStreamCountByCountryDto,
	) {
		const data =
			await this.statisticsService.getStreamCountsByCountry(query);
		return new ResponseSuccess({ data });
	}

	@Get('stream/count/by-release')
	async getStreamCountsRelease(
		@Query() query: QueryGetStreamCountByCountryDto,
	) {
		const data =
			await this.statisticsService.getStreamCountsByCountry(query);
		return new ResponseSuccess({ data });
	}
}
