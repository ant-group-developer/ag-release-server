import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { EntityAnalyticsService } from '../services/entity-analytics.service';
import {
	ChartQueryDto,
	EntityOverviewQueryDto,
	EntityTimelineQueryDto,
} from '../dto/analytics-query.dto';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { Request } from 'express';

@ApiTags('Analytics - Artist')
@Controller('analytics/artist/:artistId')
export class ArtistAnalyticsController {
	constructor(private readonly entitySvc: EntityAnalyticsService) {}

	@Post('overview')
	@ApiOperation({ summary: 'Overview stats for an artist' })
	async overview(
		@Param('artistId') artistId: string,
		@Body() dto: EntityOverviewQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getOverview(
				'artist',
				artistId,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('trend-view/dsp/timeline')
	@ApiOperation({
		summary: 'Trend view DSP timeline for an artist (monthly)',
	})
	async trendViewTimeline(
		@Param('artistId') artistId: string,
		@Body() dto: EntityTimelineQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getTrendViewDspTimeline(
				'artist',
				artistId,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('sales-view/dsp/timeline')
	@ApiOperation({
		summary: 'Sales view DSP timeline for an artist (monthly)',
	})
	async salesViewTimeline(
		@Param('artistId') artistId: string,
		@Body() dto: EntityTimelineQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getSalesViewDspTimeline(
				'artist',
				artistId,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('trend-view/dsp/timeline/daily')
	@ApiOperation({ summary: 'Trend view DSP daily timeline for an artist' })
	async trendViewDailyTimeline(
		@Param('artistId') artistId: string,
		@Body() dto: EntityTimelineQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getTrendViewDspDailyTimeline(
				'artist',
				artistId,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('revenue/timeline')
	@ApiOperation({
		summary: 'Revenue timeline for an artist (monthly, DSP breakdown)',
	})
	async revenueTimeline(
		@Param('artistId') artistId: string,
		@Body() dto: EntityTimelineQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getRevenueTimeline(
				'artist',
				artistId,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('trend-view/line-chart')
	@ApiOperation({ summary: 'Trend view line chart for an artist' })
	async trendViewLineChart(
		@Param('artistId') artistId: string,
		@Body() dto: ChartQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getTrendViewLineChart(
				'artist',
				artistId,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('revenue/line-chart')
	@ApiOperation({ summary: 'Revenue line chart for an artist' })
	async revenueLineChart(
		@Param('artistId') artistId: string,
		@Body() dto: ChartQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getRevenueLineChart(
				'artist',
				artistId,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('trend-view/dsp/bar-chart')
	@ApiOperation({ summary: 'Trend view DSP bar chart for an artist' })
	async trendViewDspBarChart(
		@Param('artistId') artistId: string,
		@Body() dto: ChartQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getTrendViewDspBarChart(
				'artist',
				artistId,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('trend-view/ter/bar-chart')
	@ApiOperation({ summary: 'Trend view territory bar chart for an artist' })
	async trendViewTerritoryBarChart(
		@Param('artistId') artistId: string,
		@Body() dto: ChartQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getTrendViewTerritoryBarChart(
				'artist',
				artistId,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('revenue/dsp/bar-chart')
	@ApiOperation({ summary: 'Revenue DSP bar chart for an artist' })
	async revenueDspBarChart(
		@Param('artistId') artistId: string,
		@Body() dto: ChartQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getRevenueDspBarChart(
				'artist',
				artistId,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('revenue/ter/bar-chart')
	@ApiOperation({ summary: 'Revenue territory bar chart for an artist' })
	async revenueTerritoryBarChart(
		@Param('artistId') artistId: string,
		@Body() dto: ChartQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getRevenueTerritoryBarChart(
				'artist',
				artistId,
				dto,
				req.user!.tenantId,
			),
		});
	}
}
