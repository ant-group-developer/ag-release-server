import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import {
	ChartQueryDto,
	EntityOverviewQueryDto,
	EntityTimelineQueryDto,
} from '../dto/analytics-query.dto';
import { EntityAnalyticsService } from '../services/entity-analytics.service';

@ApiTags('Analytics - Track')
@Controller('analytics/track/:isrc')
export class TrackAnalyticsController {
	constructor(private readonly entitySvc: EntityAnalyticsService) {}

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

	@Post('trend-view/dsp/timeline')
	@ApiOperation({ summary: 'Trend view DSP timeline for a track (monthly)' })
	async trendViewTimeline(
		@Param('isrc') isrc: string,
		@Body() dto: EntityTimelineQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getTrendViewDspTimeline(
				'track',
				isrc,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('sales-view/dsp/timeline')
	@ApiOperation({ summary: 'Sales view DSP timeline for a track (monthly)' })
	async salesViewTimeline(
		@Param('isrc') isrc: string,
		@Body() dto: EntityTimelineQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getSalesViewDspTimeline(
				'track',
				isrc,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('trend-view/dsp/timeline/daily')
	@ApiOperation({ summary: 'Trend view DSP daily timeline for a track' })
	async trendViewDailyTimeline(
		@Param('isrc') isrc: string,
		@Body() dto: EntityTimelineQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getTrendViewDspDailyTimeline(
				'track',
				isrc,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('revenue/timeline')
	@ApiOperation({
		summary: 'Revenue timeline for a track (monthly, DSP breakdown)',
	})
	async revenueTimeline(
		@Param('isrc') isrc: string,
		@Body() dto: EntityTimelineQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getRevenueTimeline(
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
		@Body() dto: ChartQueryDto,
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
		@Body() dto: ChartQueryDto,
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
		@Body() dto: ChartQueryDto,
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
}
