import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import {
	AnalyticsSummaryQueryDto,
	ChartQueryDto,
	RevenueChartQueryDto,
	EntityOverviewQueryDto,
	EntityRankingQueryDto,
} from '../dto/analytics-query.dto';
import { EntityAnalyticsService } from '../services/entity-analytics.service';

@ApiTags('Analytics - Track')
@Controller('analytics/track/:isrc')
export class TrackAnalyticsController {
	constructor(private readonly entitySvc: EntityAnalyticsService) {}

	@Post('summary')
	@ApiOperation({ summary: 'Unified analytics summary for a track' })
	async summary(
		@Param('isrc') isrc: string,
		@Body() dto: AnalyticsSummaryQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getSummary(
				'track',
				isrc,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('overview')
	@ApiOperation({ summary: 'Overview stats for a track' })
	async overview(
		@Param('isrc') isrc: string,
		@Body() dto: EntityOverviewQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getOverview(
				'track',
				isrc,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('trend-view/line-chart')
	@ApiOperation({ summary: 'Trend view line chart for a track' })
	async trendViewLineChart(
		@Param('isrc') isrc: string,
		@Body() dto: ChartQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getTrendViewLineChart(
				'track',
				isrc,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('revenue/line-chart')
	@ApiOperation({ summary: 'Revenue line chart for a track' })
	async revenueLineChart(
		@Param('isrc') isrc: string,
		@Body() dto: RevenueChartQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getRevenueLineChart(
				'track',
				isrc,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('trend-view/dsp/bar-chart')
	@ApiOperation({ summary: 'Trend view DSP bar chart for a track' })
	async trendViewDspBarChart(
		@Param('isrc') isrc: string,
		@Body() dto: ChartQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getTrendViewDspBarChart(
				'track',
				isrc,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('trend-view/ter/bar-chart')
	@ApiOperation({ summary: 'Trend view territory bar chart for a track' })
	async trendViewTerritoryBarChart(
		@Param('isrc') isrc: string,
		@Body() dto: ChartQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getTrendViewTerritoryBarChart(
				'track',
				isrc,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('revenue/dsp/bar-chart')
	@ApiOperation({ summary: 'Revenue DSP bar chart for a track' })
	async revenueDspBarChart(
		@Param('isrc') isrc: string,
		@Body() dto: RevenueChartQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getRevenueDspBarChart(
				'track',
				isrc,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('revenue/ter/bar-chart')
	@ApiOperation({ summary: 'Revenue territory bar chart for a track' })
	async revenueTerritoryBarChart(
		@Param('isrc') isrc: string,
		@Body() dto: RevenueChartQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getRevenueTerritoryBarChart(
				'track',
				isrc,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('dsp')
	@ApiOperation({ summary: 'Top DSPs của track (sortBy: views | usage | revenue)' })
	async topDsps(
		@Param('isrc') isrc: string,
		@Body() dto: EntityRankingQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getTopDsps(
				'track',
				isrc,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('ter')
	@ApiOperation({
		summary: 'Top territories của track (sortBy: views | usage | revenue)',
	})
	async topTerritories(
		@Param('isrc') isrc: string,
		@Body() dto: EntityRankingQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getTopTerritories(
				'track',
				isrc,
				dto,
				req.user!.tenantId,
			),
		});
	}
}
