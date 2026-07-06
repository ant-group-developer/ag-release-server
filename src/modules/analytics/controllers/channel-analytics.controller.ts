import {
	Body,
	Controller,
	Param,
	ParseUUIDPipe,
	Post,
	Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import {
	ChartQueryDto,
	EntityOverviewQueryDto,
	EntityRankingQueryDto,
	EntityTimelineQueryDto,
} from '../dto/analytics-query.dto';
import { EntityAnalyticsService } from '../services/entity-analytics.service';

@ApiTags('Analytics - Channel')
@Controller('analytics/channel/:channelId')
export class ChannelAnalyticsController {
	constructor(private readonly entitySvc: EntityAnalyticsService) {}

	@Post('overview')
	@ApiOperation({
		summary:
			'Overview stats for a channel (total trend views, sales views, revenue)',
	})
	async overview(
		@Param('channelId', ParseUUIDPipe) channelId: string,
		@Body() dto: EntityOverviewQueryDto,
		@Req() req: Request,
	) {
		const data = await this.entitySvc.getOverview(
			'channel',
			channelId,
			dto,
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data });
	}

	@Post('trend-view/dsp/timeline')
	@ApiOperation({
		summary: 'Trend view DSP timeline for a channel (monthly)',
	})
	async trendViewTimeline(
		@Param('channelId', ParseUUIDPipe) channelId: string,
		@Body() dto: EntityTimelineQueryDto,
		@Req() req: Request,
	) {
		const data = await this.entitySvc.getTrendViewDspTimeline(
			'channel',
			channelId,
			dto,
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data });
	}

	@Post('sales-view/dsp/timeline')
	@ApiOperation({
		summary: 'Sales view DSP timeline for a channel (monthly)',
	})
	async salesViewTimeline(
		@Param('channelId', ParseUUIDPipe) channelId: string,
		@Body() dto: EntityTimelineQueryDto,
		@Req() req: Request,
	) {
		const data = await this.entitySvc.getSalesViewDspTimeline(
			'channel',
			channelId,
			dto,
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data });
	}

	@Post('trend-view/dsp/timeline/daily')
	@ApiOperation({ summary: 'Trend view DSP daily timeline for a channel' })
	async trendViewDailyTimeline(
		@Param('channelId', ParseUUIDPipe) channelId: string,
		@Body() dto: EntityTimelineQueryDto,
		@Req() req: Request,
	) {
		const data = await this.entitySvc.getTrendViewDspDailyTimeline(
			'channel',
			channelId,
			dto,
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data });
	}

	@Post('revenue/timeline')
	@ApiOperation({
		summary: 'Revenue timeline for a channel (monthly, DSP breakdown)',
	})
	async revenueTimeline(
		@Param('channelId', ParseUUIDPipe) channelId: string,
		@Body() dto: EntityTimelineQueryDto,
		@Req() req: Request,
	) {
		const data = await this.entitySvc.getRevenueTimeline(
			'channel',
			channelId,
			dto,
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data });
	}

	@Post('trend-view/line-chart')
	@ApiOperation({ summary: 'Trend view line chart for a channel' })
	async trendViewLineChart(
		@Param('channelId', ParseUUIDPipe) channelId: string,
		@Body() dto: ChartQueryDto,
		@Req() req: Request,
	) {
		const data = await this.entitySvc.getTrendViewLineChart(
			'channel',
			channelId,
			dto,
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data });
	}

	@Post('revenue/line-chart')
	@ApiOperation({ summary: 'Revenue line chart for a channel' })
	async revenueLineChart(
		@Param('channelId', ParseUUIDPipe) channelId: string,
		@Body() dto: ChartQueryDto,
		@Req() req: Request,
	) {
		const data = await this.entitySvc.getRevenueLineChart(
			'channel',
			channelId,
			dto,
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data });
	}

	@Post('trend-view/dsp/bar-chart')
	@ApiOperation({ summary: 'Trend view DSP bar chart for a channel' })
	async trendViewDspBarChart(
		@Param('channelId', ParseUUIDPipe) channelId: string,
		@Body() dto: ChartQueryDto,
		@Req() req: Request,
	) {
		const data = await this.entitySvc.getTrendViewDspBarChart(
			'channel',
			channelId,
			dto,
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data });
	}

	@Post('trend-view/ter/bar-chart')
	@ApiOperation({ summary: 'Trend view territory bar chart for a channel' })
	async trendViewTerritoryBarChart(
		@Param('channelId', ParseUUIDPipe) channelId: string,
		@Body() dto: ChartQueryDto,
		@Req() req: Request,
	) {
		const data = await this.entitySvc.getTrendViewTerritoryBarChart(
			'channel',
			channelId,
			dto,
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data });
	}

	@Post('revenue/dsp/bar-chart')
	@ApiOperation({ summary: 'Revenue DSP bar chart for a channel' })
	async revenueDspBarChart(
		@Param('channelId', ParseUUIDPipe) channelId: string,
		@Body() dto: ChartQueryDto,
		@Req() req: Request,
	) {
		const data = await this.entitySvc.getRevenueDspBarChart(
			'channel',
			channelId,
			dto,
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data });
	}

	@Post('revenue/ter/bar-chart')
	@ApiOperation({ summary: 'Revenue territory bar chart for a channel' })
	async revenueTerritoryBarChart(
		@Param('channelId', ParseUUIDPipe) channelId: string,
		@Body() dto: ChartQueryDto,
		@Req() req: Request,
	) {
		const data = await this.entitySvc.getRevenueTerritoryBarChart(
			'channel',
			channelId,
			dto,
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data });
	}

	@Post('top-releases')
	@ApiOperation({
		summary:
			'Top releases của channel (sortBy: views | revenue, trả cả 2 metric)',
	})
	async topReleases(
		@Param('channelId', ParseUUIDPipe) channelId: string,
		@Body() dto: EntityRankingQueryDto,
		@Req() req: Request,
	) {
		const data = await this.entitySvc.getTopReleases(
			'channel',
			channelId,
			dto,
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data });
	}

	@Post('dsp')
	@ApiOperation({ summary: 'Top DSPs của channel (sortBy: views | revenue)' })
	async topDsps(
		@Param('channelId', ParseUUIDPipe) channelId: string,
		@Body() dto: EntityRankingQueryDto,
		@Req() req: Request,
	) {
		const data = await this.entitySvc.getTopDsps(
			'channel',
			channelId,
			dto,
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data });
	}

	@Post('ter')
	@ApiOperation({ summary: 'Top territories của channel (sortBy: views | revenue)' })
	async topTerritories(
		@Param('channelId', ParseUUIDPipe) channelId: string,
		@Body() dto: EntityRankingQueryDto,
		@Req() req: Request,
	) {
		const data = await this.entitySvc.getTopTerritories(
			'channel',
			channelId,
			dto,
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data });
	}
}
