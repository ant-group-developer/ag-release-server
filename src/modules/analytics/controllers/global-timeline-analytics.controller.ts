import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { PageDto, ResponseSuccess } from 'src/common/dtos/common.response.dto';
import {
	AnalyticsSummaryQueryDto,
	ChartQueryDto,
	RevenueChartQueryDto,
	TimelineQueryDto,
} from '../dto/analytics-query.dto';
import {
	DspBarChartItem,
	AnalyticsSummaryResponse,
	OverviewTrendsResponse,
	RevenueArtistItem,
	RevenueChannelItem,
	RevenueDspItem,
	RevenueLabelItem,
	RevenueLineChartItem,
	RevenueOverviewResponse,
	RevenueReleaseItem,
	RevenueReleaseVideoItem,
	RevenueSourceTypeItem,
	RevenueTenantItem,
	RevenueTrackItem,
	TerritoryBarChartItem,
	TrendViewLineChartItem,
} from '../interfaces/analytics.interface';
import { TimelineAnalyticsService } from '../services/global-timeline.service';

/**
 * Controller thống kê dạng timeline (DSP và Territory) từ nguồn Sales và Trends.
 * Lọc native theo phân quyền Multi-Tenant trên ClickHouse bằng INNER JOIN pg_tracks_sync.
 */
@ApiTags('Analytics')
@Controller('analytics')
export class TimelineAnalyticsController {
	constructor(private readonly timelineService: TimelineAnalyticsService) {}

	@Post('summary')
	@ApiOperation({
		summary: 'Get unified analytics summary for the current tenant',
		description:
			'Trend views use the exact day range. Usage and revenue include every reporting month intersecting the range.',
	})
	async getSummary(
		@Req() req: Request,
		@Body() query: AnalyticsSummaryQueryDto,
	): Promise<ResponseSuccess<AnalyticsSummaryResponse>> {
		const data = await this.timelineService.getSummary(
			req.user!.tenantId,
			query,
		);
		return new ResponseSuccess({ data });
	}

	// ═══════════════════════════════════════════════════════
	// DSP TIMELINE ENDPOINTS
	// ═══════════════════════════════════════════════════════




	// ═══════════════════════════════════════════════════════
	// TERRITORY TIMELINE ENDPOINTS
	// ═══════════════════════════════════════════════════════



	// ═══════════════════════════════════════════════════════
	// REVENUE ANALYTICS
	// ═══════════════════════════════════════════════════════

	@Post('revenue/summary')
	@ApiOperation({
		summary: 'Get revenue overview statistics for tenant',
		description:
			'Returns total revenue (USD), total quantity (plays), and total distinct territories. ' +
			'System-tenant sees all data; normal tenant sees only their own.',
	})
	@ApiResponse({
		status: 201,
		description: 'Revenue overview statistics retrieved successfully.',
	})
	async getRevenueOverview(
		@Req() req: Request,
		@Body() query: TimelineQueryDto,
	): Promise<ResponseSuccess<RevenueOverviewResponse>> {
		const data = await this.timelineService.getRevenueOverview(
			req.user!.tenantId,
			query,
		);
		return new ResponseSuccess({ data });
	}


	@Post('revenue/top-dsp')
	@ApiOperation({
		summary: 'Get top DSPs by revenue for tenant',
		description:
			'Returns top DSPs sorted by USD revenue. Maps DSP name from pg_dsps_sync first, ' +
			'falling back to dsps_report, and finally native ID.',
	})
	@ApiResponse({
		status: 201,
		description: 'Top DSPs by revenue retrieved successfully.',
	})
	async getRevenueTopDsp(
		@Req() req: Request,
		@Body() query: TimelineQueryDto,
	): Promise<ResponseSuccess<PageDto<RevenueDspItem>>> {
		const data = await this.timelineService.getRevenueTopDsp(
			req.user!.tenantId,
			query,
		);
		return new ResponseSuccess({ data });
	}

	@Post('revenue/top-artist')
	@ApiOperation({
		summary: 'Get top artists by revenue for tenant',
		description:
			'Returns top artists sorted by USD revenue. ' +
			'Groups by artist_ids from pg_tracks_sync. System-tenant sees all data.',
	})
	@ApiResponse({
		status: 201,
		description: 'Top artists by revenue retrieved successfully.',
	})
	async getRevenueTopArtist(
		@Req() req: Request,
		@Body() query: TimelineQueryDto,
	): Promise<ResponseSuccess<PageDto<RevenueArtistItem>>> {
		const data = await this.timelineService.getRevenueTopArtist(
			req.user!.tenantId,
			query,
		);
		return new ResponseSuccess({ data });
	}

	@Post('revenue/top-track')
	@ApiOperation({
		summary: 'Get top tracks by revenue for tenant',
		description:
			'Returns top tracks sorted by USD revenue. ' +
			'Normal tenant filters by pg_tracks_sync. ' +
			'System-tenant queries all ISRCs in ClickHouse; metadata missing from Postgres is resolved from fact_sales_report.',
	})
	@ApiResponse({
		status: 201,
		description: 'Top tracks by revenue retrieved successfully.',
	})
	async getRevenueTopTrack(
		@Req() req: Request,
		@Body() query: TimelineQueryDto,
	): Promise<ResponseSuccess<PageDto<RevenueTrackItem>>> {
		const data = await this.timelineService.getRevenueTopTrack(
			req.user!.tenantId,
			query,
		);
		return new ResponseSuccess({ data });
	}

	@Post('revenue/top-label')
	@ApiOperation({
		summary: 'Get top labels by revenue for tenant',
		description:
			'Returns top labels sorted by USD revenue. ' +
			"Always filtered by logged-in user's tenant.",
	})
	@ApiResponse({
		status: 201,
		description: 'Top labels by revenue retrieved successfully.',
	})
	async getRevenueTopLabel(
		@Req() req: Request,
		@Body() query: TimelineQueryDto,
	): Promise<ResponseSuccess<PageDto<RevenueLabelItem>>> {
		const data = await this.timelineService.getRevenueTopLabel(
			req.user!.tenantId,
			query,
		);
		return new ResponseSuccess({ data });
	}

	@Post('revenue/top-tenant')
	@ApiOperation({
		summary: 'Get top tenants by revenue',
		description:
			'Returns top tenants sorted by USD revenue. System-tenant sees all, normal tenant sees only self.',
	})
	@ApiResponse({
		status: 201,
		description: 'Top tenants by revenue retrieved successfully.',
	})
	async getRevenueTopTenant(
		@Req() req: Request,
		@Body() query: TimelineQueryDto,
	): Promise<ResponseSuccess<PageDto<RevenueTenantItem>>> {
		const data = await this.timelineService.getRevenueTopTenant(
			req.user!.tenantId,
			query,
		);
		return new ResponseSuccess({ data });
	}

	@Post('revenue/top-source-type')
	@ApiOperation({
		summary: 'Get top source types by revenue',
		description:
			'Returns import sources (ftp, wmg_report, spotify_report, ...) sorted by USD revenue. System-tenant sees all, normal tenant sees only self.',
	})
	@ApiResponse({
		status: 201,
		description: 'Top source types by revenue retrieved successfully.',
	})
	async getRevenueTopSourceType(
		@Req() req: Request,
		@Body() query: TimelineQueryDto,
	): Promise<ResponseSuccess<PageDto<RevenueSourceTypeItem>>> {
		const data = await this.timelineService.getRevenueTopSourceType(
			req.user!.tenantId,
			query,
		);
		return new ResponseSuccess({ data });
	}

	@Post('revenue/top-release')
	@ApiOperation({
		summary: 'Get top releases by revenue for tenant',
		description:
			'Returns top releases sorted by USD revenue. ' +
			"Always filtered by logged-in user's tenant.",
	})
	@ApiResponse({
		status: 201,
		description: 'Top releases by revenue retrieved successfully.',
	})
	async getRevenueTopRelease(
		@Req() req: Request,
		@Body() query: TimelineQueryDto,
	): Promise<ResponseSuccess<PageDto<RevenueReleaseItem>>> {
		const data = await this.timelineService.getRevenueTopRelease(
			req.user!.tenantId,
			query,
		);
		return new ResponseSuccess({ data });
	}

	@Post('revenue/top-release-video')
	@ApiOperation({
		summary: 'Get top video releases by revenue for tenant',
		description:
			'Returns top video releases sorted by USD revenue, including channelName and workspaceName.',
	})
	@ApiResponse({
		status: 201,
		description: 'Top video releases by revenue retrieved successfully.',
	})
	async getRevenueTopReleaseVideo(
		@Req() req: Request,
		@Body() query: TimelineQueryDto,
	): Promise<ResponseSuccess<PageDto<RevenueReleaseVideoItem>>> {
		const data = await this.timelineService.getRevenueTopReleaseVideo(
			req.user!.tenantId,
			query,
		);
		return new ResponseSuccess({ data });
	}

	@Post('revenue/top-channel')
	@ApiOperation({
		summary: 'Get top channels by revenue for tenant',
		description:
			'Returns top channels (video only) sorted by USD revenue. ' +
			'Channel metadata resolved from Postgres channels table. ' +
			'System-tenant sees all; normal tenant sees only their own.',
	})
	@ApiResponse({
		status: 201,
		description: 'Top channels by revenue retrieved successfully.',
	})
	async getRevenueTopChannel(
		@Req() req: Request,
		@Body() query: TimelineQueryDto,
	): Promise<ResponseSuccess<PageDto<RevenueChannelItem>>> {
		const data = await this.timelineService.getRevenueTopChannel(
			req.user!.tenantId,
			query,
		);
		return new ResponseSuccess({ data });
	}

	@Post('trend-view/summary')
	@ApiOperation({
		summary: 'Get trend view overview statistics for tenant',
		description:
			'Returns total views (quantity), distinct DSPs, tracks, artists, and labels. ' +
			'System-tenant sees all data; normal tenant sees only their own.',
	})
	@ApiResponse({
		status: 201,
		description: 'Trend view overview statistics retrieved successfully.',
	})
	async getTrendsOverview(
		@Req() req: Request,
		@Body() query: TimelineQueryDto,
	): Promise<ResponseSuccess<OverviewTrendsResponse>> {
		const data = await this.timelineService.getTrendsOverview(
			req.user!.tenantId,
			query,
		);
		return new ResponseSuccess({ data });
	}

	// ═══════════════════════════════════════════════════════
	// CHART APIs (Line Chart & Bar Chart)
	// ═══════════════════════════════════════════════════════

	@Post('trend-view/line-chart')
	@ApiOperation({
		summary: 'Get daily trend views line chart data',
		description:
			'Returns total trend views aggregated by day for the exact fromDate/toDate range. ' +
			'Uses trends_dsp_daily_cube.',
	})
	@ApiResponse({
		status: 201,
		description: 'Trend view line chart data retrieved successfully.',
	})
	async getTrendViewLineChart(
		@Req() req: Request,
		@Body() query: ChartQueryDto,
	): Promise<ResponseSuccess<TrendViewLineChartItem[]>> {
		const data = await this.timelineService.getTrendViewLineChart(
			req.user!.tenantId,
			query,
		);
		return new ResponseSuccess({ data });
	}

	@Post('trend-view/dsp/bar-chart')
	@ApiOperation({
		summary: 'Get top 5 DSPs by trend views bar chart data',
		description:
			'Returns top 5 DSPs by total trend views with an "Other" bucket for the rest. ' +
			'Uses trends_dsp_daily_cube for near real-time play count data.',
	})
	@ApiResponse({
		status: 201,
		description: 'Trend view DSP bar chart data retrieved successfully.',
	})
	async getTrendViewDspBarChart(
		@Req() req: Request,
		@Body() query: ChartQueryDto,
	): Promise<ResponseSuccess<DspBarChartItem[]>> {
		const data = await this.timelineService.getTrendViewDspBarChart(
			req.user!.tenantId,
			query,
		);
		return new ResponseSuccess({ data });
	}

	@Post('trend-view/ter/bar-chart')
	@ApiOperation({
		summary: 'Get top 5 territories by trend views bar chart data',
		description:
			'Returns top 5 territories by total trend views with an "Other" bucket for the rest. ' +
			'Uses trends_ter_daily_cube for the exact fromDate/toDate range.',
	})
	@ApiResponse({
		status: 201,
		description:
			'Trend view territory bar chart data retrieved successfully.',
	})
	async getTrendViewTerritoryBarChart(
		@Req() req: Request,
		@Body() query: ChartQueryDto,
	): Promise<ResponseSuccess<TerritoryBarChartItem[]>> {
		const data = await this.timelineService.getTrendViewTerritoryBarChart(
			req.user!.tenantId,
			query,
		);
		return new ResponseSuccess({ data });
	}

	@Post('revenue/line-chart')
	@ApiOperation({
		summary: 'Get monthly revenue line chart data',
		description:
			'Returns total revenue (USD) and quantity aggregated by month. Uses sales_dsp_monthly_cube_v2. ' +
			'Dates are normalized to first-of-month since sales data is monthly.',
	})
	@ApiResponse({
		status: 201,
		description: 'Revenue line chart data retrieved successfully.',
	})
	async getRevenueLineChart(
		@Req() req: Request,
		@Body() query: RevenueChartQueryDto,
	): Promise<ResponseSuccess<RevenueLineChartItem[]>> {
		const data = await this.timelineService.getRevenueLineChart(
			req.user!.tenantId,
			query,
		);
		return new ResponseSuccess({ data });
	}

	@Post('revenue/dsp/bar-chart')
	@ApiOperation({
		summary: 'Get top 5 DSPs by revenue bar chart data',
		description:
			'Returns top 5 DSPs by total revenue with an "Other" bucket for the rest. ' +
			'Uses sales_dsp_monthly_cube_v2 for official revenue data.',
	})
	@ApiResponse({
		status: 201,
		description: 'Revenue DSP bar chart data retrieved successfully.',
	})
	async getRevenueDspBarChart(
		@Req() req: Request,
		@Body() query: RevenueChartQueryDto,
	): Promise<ResponseSuccess<DspBarChartItem[]>> {
		const data = await this.timelineService.getRevenueDspBarChart(
			req.user!.tenantId,
			query,
		);
		return new ResponseSuccess({ data });
	}

	@Post('revenue/ter/bar-chart')
	@ApiOperation({
		summary: 'Get top 5 territories by revenue bar chart data',
		description:
			'Returns top 5 territories by total revenue with an "Other" bucket for the rest. ' +
			'Uses sales_ter_monthly_cube_v2 for official revenue data.',
	})
	@ApiResponse({
		status: 201,
		description: 'Revenue territory bar chart data retrieved successfully.',
	})
	async getRevenueTerritoryBarChart(
		@Req() req: Request,
		@Body() query: RevenueChartQueryDto,
	): Promise<ResponseSuccess<TerritoryBarChartItem[]>> {
		const data = await this.timelineService.getRevenueTerritoryBarChart(
			req.user!.tenantId,
			query,
		);
		return new ResponseSuccess({ data });
	}
}
