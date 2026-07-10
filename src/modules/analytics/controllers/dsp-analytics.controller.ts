import { Body, Controller, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import {
	DspChartQueryDto,
	DspOverviewQueryDto,
	DspTopQueryDto,
} from '../dto/analytics-query.dto';
import { DspAnalyticsService } from '../services/dsp-analytics.service';

/**
 * Endpoint chi tiết cho 1 DSP. Body luôn nhận cả `pgDspId` + `dspReportId`
 * (ít nhất 1 trong 2). FE lấy 2 field này từ response của
 * `POST /analytics/ranking/dsp` hoặc `POST /analytics/revenue/top-dsp`.
 */
@ApiTags('Analytics - DSP')
@Controller('analytics/dsp')
export class DspAnalyticsController {
	constructor(private readonly dspSvc: DspAnalyticsService) {}

	@Post('overview')
	@ApiOperation({
		summary:
			'Overview stats cho 1 DSP (tổng trend views, sales views, revenue, DSP meta)',
	})
	async overview(@Body() dto: DspOverviewQueryDto, @Req() req: Request) {
		const data = await this.dspSvc.getOverview(dto, req.user!.tenantId);
		return new ResponseSuccess({ data });
	}

	@Post('trend-view/line-chart')
	@ApiOperation({ summary: 'Trend view line chart cho 1 DSP (monthly)' })
	async trendViewLineChart(
		@Body() dto: DspChartQueryDto,
		@Req() req: Request,
	) {
		const data = await this.dspSvc.getTrendViewLineChart(
			dto,
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data });
	}

	@Post('revenue/line-chart')
	@ApiOperation({ summary: 'Revenue line chart cho 1 DSP (monthly)' })
	async revenueLineChart(@Body() dto: DspChartQueryDto, @Req() req: Request) {
		const data = await this.dspSvc.getRevenueLineChart(
			dto,
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data });
	}

	@Post('trend-view/ter/bar-chart')
	@ApiOperation({
		summary: 'Trend view territory bar chart cho 1 DSP (top 5 + Other)',
	})
	async trendViewTerritoryBarChart(
		@Body() dto: DspChartQueryDto,
		@Req() req: Request,
	) {
		const data = await this.dspSvc.getTrendViewTerritoryBarChart(
			dto,
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data });
	}

	@Post('revenue/ter/bar-chart')
	@ApiOperation({
		summary: 'Revenue territory bar chart cho 1 DSP (top 5 + Other)',
	})
	async revenueTerritoryBarChart(
		@Body() dto: DspChartQueryDto,
		@Req() req: Request,
	) {
		const data = await this.dspSvc.getRevenueTerritoryBarChart(
			dto,
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data });
	}

	@Post('top-tracks')
	@ApiOperation({
		summary:
			'Top tracks của 1 DSP (sortBy: views | revenue, trả cả 2 metric)',
	})
	async topTracks(@Body() dto: DspTopQueryDto, @Req() req: Request) {
		const data = await this.dspSvc.getTopTracks(dto, req.user!.tenantId);
		return new ResponseSuccess({ data });
	}

	@Post('top-releases')
	@ApiOperation({
		summary:
			'Top releases của 1 DSP (sortBy: views | revenue, trả cả 2 metric)',
	})
	async topReleases(@Body() dto: DspTopQueryDto, @Req() req: Request) {
		const data = await this.dspSvc.getTopReleases(dto, req.user!.tenantId);
		return new ResponseSuccess({ data });
	}

	@Post('ter')
	@ApiOperation({
		summary: 'Top territories của 1 DSP (sortBy: views | revenue)',
	})
	async topTerritories(@Body() dto: DspTopQueryDto, @Req() req: Request) {
		const data = await this.dspSvc.getTopTerritories(dto, req.user!.tenantId);
		return new ResponseSuccess({ data });
	}
}
