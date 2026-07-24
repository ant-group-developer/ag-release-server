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

@ApiTags('Analytics - Artist')
@Controller('analytics/artist/:artistId')
export class ArtistAnalyticsController {
	constructor(private readonly entitySvc: EntityAnalyticsService) {}

	@Post('summary')
	@ApiOperation({ summary: 'Unified analytics summary for an artist' })
	async summary(
		@Param('artistId') artistId: string,
		@Body() dto: AnalyticsSummaryQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getSummary(
				'artist',
				artistId,
				dto,
				req.user!.tenantId,
			),
		});
	}

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
		@Body() dto: RevenueChartQueryDto,
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
		@Body() dto: RevenueChartQueryDto,
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
		@Body() dto: RevenueChartQueryDto,
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

	@Post('top-tracks')
	@ApiOperation({
		summary: 'Top tracks của artist (sortBy: views | usage | revenue)',
	})
	async topTracks(
		@Param('artistId') artistId: string,
		@Body() dto: EntityRankingQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getTopTracks(
				'artist',
				artistId,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('top-releases')
	@ApiOperation({
		summary: 'Top releases của artist (sortBy: views | usage | revenue)',
	})
	async topReleases(
		@Param('artistId') artistId: string,
		@Body() dto: EntityRankingQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getTopReleases(
				'artist',
				artistId,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('dsp')
	@ApiOperation({ summary: 'Top DSPs của artist (sortBy: views | usage | revenue)' })
	async topDsps(
		@Param('artistId') artistId: string,
		@Body() dto: EntityRankingQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getTopDsps(
				'artist',
				artistId,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('ter')
	@ApiOperation({
		summary: 'Top territories của artist (sortBy: views | usage | revenue)',
	})
	async topTerritories(
		@Param('artistId') artistId: string,
		@Body() dto: EntityRankingQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getTopTerritories(
				'artist',
				artistId,
				dto,
				req.user!.tenantId,
			),
		});
	}
}
