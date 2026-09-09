import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import {
	ChartQueryDto,
	EntityOverviewQueryDto,
	EntityRankingQueryDto,
	RevenueChartQueryDto,
} from '../dto/analytics-query.dto';
import { TerAnalyticsService } from '../services/ter-analytics.service';

@ApiTags('Analytics - Territory')
@Controller('analytics/ter/:isoCode')
export class TerAnalyticsController {
	constructor(private readonly terSvc: TerAnalyticsService) {}

	@Post('overview')
	@ApiOperation({ summary: 'Overview stats for a territory (ISO2 code)' })
	async overview(
		@Param('isoCode') isoCode: string,
		@Body() dto: EntityOverviewQueryDto,
	) {
		return new ResponseSuccess({
			data: await this.terSvc.getOverview(isoCode, dto),
		});
	}

	@Post('trend-view/line-chart')
	@ApiOperation({ summary: 'Daily trend view line chart for a territory' })
	async trendViewLineChart(
		@Param('isoCode') isoCode: string,
		@Body() dto: ChartQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.terSvc.getTrendViewLineChart(
				isoCode,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('revenue/line-chart')
	@ApiOperation({ summary: 'Monthly revenue line chart for a territory' })
	async revenueLineChart(
		@Param('isoCode') isoCode: string,
		@Body() dto: RevenueChartQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.terSvc.getRevenueLineChart(
				isoCode,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('top-tracks')
	@ApiOperation({
		summary: 'Top tracks in a territory (sortBy: views | usage | revenue)',
	})
	async topTracks(
		@Param('isoCode') isoCode: string,
		@Body() dto: EntityRankingQueryDto,
	) {
		return new ResponseSuccess({
			data: await this.terSvc.getTopTracks(isoCode, dto),
		});
	}

	@Post('top-releases')
	@ApiOperation({
		summary:
			'Top releases in a territory (sortBy: views | usage | revenue)',
	})
	async topReleases(
		@Param('isoCode') isoCode: string,
		@Body() dto: EntityRankingQueryDto,
	) {
		return new ResponseSuccess({
			data: await this.terSvc.getTopReleases(isoCode, dto),
		});
	}

	@Post('dsp')
	@ApiOperation({
		summary: 'Top DSPs in a territory (sortBy: views | usage | revenue)',
	})
	async topDsps(
		@Param('isoCode') isoCode: string,
		@Body() dto: EntityRankingQueryDto,
	) {
		return new ResponseSuccess({
			data: await this.terSvc.getTopDsps(isoCode, dto),
		});
	}
}
