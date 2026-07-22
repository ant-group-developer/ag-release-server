import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import {
	ChartQueryDto,
	EntityOverviewQueryDto,
	EntityRankingQueryDto,
} from '../dto/analytics-query.dto';
import { EntityAnalyticsService } from '../services/entity-analytics.service';

@ApiTags('Analytics - Source Type')
@Controller('analytics/source-type/:sourceType')
export class SourceTypeAnalyticsController {
	constructor(private readonly entitySvc: EntityAnalyticsService) {}

	@Post('overview')
	@ApiOperation({
		summary:
			'Overview stats for a source type (ftp, wmg_report, spotify_report, ...)',
	})
	async overview(
		@Param('sourceType') sourceType: string,
		@Body() dto: EntityOverviewQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getOverview(
				'sourceType',
				sourceType,
				dto,
				req.user!.tenantId,
			),
		});
	}





	@Post('trend-view/line-chart')
	@ApiOperation({ summary: 'Trend view line chart for a source type' })
	async trendViewLineChart(
		@Param('sourceType') sourceType: string,
		@Body() dto: ChartQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getTrendViewLineChart(
				'sourceType',
				sourceType,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('revenue/line-chart')
	@ApiOperation({ summary: 'Revenue line chart for a source type' })
	async revenueLineChart(
		@Param('sourceType') sourceType: string,
		@Body() dto: ChartQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getRevenueLineChart(
				'sourceType',
				sourceType,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('trend-view/dsp/bar-chart')
	@ApiOperation({ summary: 'Trend view DSP bar chart for a source type' })
	async trendViewDspBarChart(
		@Param('sourceType') sourceType: string,
		@Body() dto: ChartQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getTrendViewDspBarChart(
				'sourceType',
				sourceType,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('trend-view/ter/bar-chart')
	@ApiOperation({
		summary: 'Trend view territory bar chart for a source type',
	})
	async trendViewTerritoryBarChart(
		@Param('sourceType') sourceType: string,
		@Body() dto: ChartQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getTrendViewTerritoryBarChart(
				'sourceType',
				sourceType,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('revenue/dsp/bar-chart')
	@ApiOperation({ summary: 'Revenue DSP bar chart for a source type' })
	async revenueDspBarChart(
		@Param('sourceType') sourceType: string,
		@Body() dto: ChartQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getRevenueDspBarChart(
				'sourceType',
				sourceType,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('revenue/ter/bar-chart')
	@ApiOperation({ summary: 'Revenue territory bar chart for a source type' })
	async revenueTerritoryBarChart(
		@Param('sourceType') sourceType: string,
		@Body() dto: ChartQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getRevenueTerritoryBarChart(
				'sourceType',
				sourceType,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('top-tracks')
	@ApiOperation({
		summary: 'Top tracks của source type (sortBy: views | revenue)',
	})
	async topTracks(
		@Param('sourceType') sourceType: string,
		@Body() dto: EntityRankingQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getTopTracks(
				'sourceType',
				sourceType,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('top-releases')
	@ApiOperation({
		summary: 'Top releases của source type (sortBy: views | revenue)',
	})
	async topReleases(
		@Param('sourceType') sourceType: string,
		@Body() dto: EntityRankingQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getTopReleases(
				'sourceType',
				sourceType,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('dsp')
	@ApiOperation({
		summary: 'Top DSPs của source type (sortBy: views | revenue)',
	})
	async topDsps(
		@Param('sourceType') sourceType: string,
		@Body() dto: EntityRankingQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getTopDsps(
				'sourceType',
				sourceType,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('ter')
	@ApiOperation({
		summary: 'Top territories của source type (sortBy: views | revenue)',
	})
	async topTerritories(
		@Param('sourceType') sourceType: string,
		@Body() dto: EntityRankingQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getTopTerritories(
				'sourceType',
				sourceType,
				dto,
				req.user!.tenantId,
			),
		});
	}
}
