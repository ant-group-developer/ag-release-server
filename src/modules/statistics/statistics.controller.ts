import { Controller, Get, Query, Req } from '@nestjs/common';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { Request } from 'express';
import { checkIsNotSystemTenant } from 'src/modules/user/utils/user-type.util';
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
	async getIssueCounts(
		@Query() query: QueryGetIssueCountDto,
		@Req() req: Request,
	) {
		const tenantId = req.user!.tenantId;
		const resolvedTenantId = checkIsNotSystemTenant(tenantId) ? tenantId : undefined;
		const data = await this.statisticsService.getIssueCounts(query, resolvedTenantId);
		return new ResponseSuccess({ data });
	}

	@Get('overview/count')
	async getOverviewCounts(
		@Query() query: QueryGetOverviewCountDto,
		@Req() req: Request,
	) {
		const tenantId = req.user!.tenantId;
		const resolvedTenantId = checkIsNotSystemTenant(tenantId) ? tenantId : undefined;
		const data = await this.statisticsService.getOverviewCounts(query, resolvedTenantId);
		return new ResponseSuccess({ data });
	}

	// stream
	@Get('stream/count/by-country')
	async getStreamCountsByCountry(
		@Query() query: QueryGetStreamCountByCountryDto,
		@Req() req: Request,
	) {
		const tenantId = req.user!.tenantId;
		const resolvedTenantId = checkIsNotSystemTenant(tenantId) ? tenantId : undefined;
		const data =
			await this.statisticsService.getStreamCountsByCountry(query, resolvedTenantId);
		return new ResponseSuccess({ data });
	}

	@Get('stream/count/by-date')
	async getStreamCountsByDate(
		@Query() query: QueryGetStreamCountByCountryDto,
		@Req() req: Request,
	) {
		const tenantId = req.user!.tenantId;
		const resolvedTenantId = checkIsNotSystemTenant(tenantId) ? tenantId : undefined;
		const data =
			await this.statisticsService.getStreamCountsByCountry(query, resolvedTenantId);
		return new ResponseSuccess({ data });
	}

	@Get('stream/count/by-release')
	async getStreamCountsRelease(
		@Query() query: QueryGetStreamCountByCountryDto,
		@Req() req: Request,
	) {
		const tenantId = req.user!.tenantId;
		const resolvedTenantId = checkIsNotSystemTenant(tenantId) ? tenantId : undefined;
		const data =
			await this.statisticsService.getStreamCountsByCountry(query, resolvedTenantId);
		return new ResponseSuccess({ data });
	}

	@Get('revenue/dsp/timeline')
	async getRevenueDspTimeline(
		@Query() query: QueryGetStreamCountByCountryDto,
		@Req() req: Request,
	) {
		const tenantId = req.user!.tenantId;
		const resolvedTenantId = checkIsNotSystemTenant(tenantId) ? tenantId : undefined;
		const data = await this.statisticsService.getRevenueDspTimeline(query, resolvedTenantId);
		return new ResponseSuccess({ data });
	}
}
