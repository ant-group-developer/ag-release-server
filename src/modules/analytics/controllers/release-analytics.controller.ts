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
	AnalyticsSummaryQueryDto,
	ChartQueryDto,
	EntityOverviewQueryDto,
	EntityRankingQueryDto,
} from '../dto/analytics-query.dto';
import { EntityAnalyticsService } from '../services/entity-analytics.service';

@ApiTags('Analytics - Release')
@Controller('analytics/release/:releaseId')
export class ReleaseAnalyticsController {
	constructor(private readonly entitySvc: EntityAnalyticsService) {}

	@Post('summary')
	@ApiOperation({ summary: 'Unified analytics summary for a release' })
	async summary(
		@Param('releaseId', ParseUUIDPipe) releaseId: string,
		@Body() dto: AnalyticsSummaryQueryDto,
		@Req() req: Request,
	) {
		const data = await this.entitySvc.getSummary(
			'release',
			releaseId,
			dto,
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data });
	}

	@Post('overview')
	@ApiOperation({
		summary:
			'Overview stats for a release (total trend views, sales views, revenue)',
	})
	async overview(
		@Param('releaseId', ParseUUIDPipe) releaseId: string,
		@Body() dto: EntityOverviewQueryDto,
		@Req() req: Request,
	) {
		const data = await this.entitySvc.getOverview(
			'release',
			releaseId,
			dto,
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data });
	}





	@Post('trend-view/line-chart')
	@ApiOperation({ summary: 'Trend view line chart for a release' })
	async trendViewLineChart(
		@Param('releaseId', ParseUUIDPipe) releaseId: string,
		@Body() dto: ChartQueryDto,
		@Req() req: Request,
	) {
		const data = await this.entitySvc.getTrendViewLineChart(
			'release',
			releaseId,
			dto,
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data });
	}

	@Post('revenue/line-chart')
	@ApiOperation({ summary: 'Revenue line chart for a release' })
	async revenueLineChart(
		@Param('releaseId', ParseUUIDPipe) releaseId: string,
		@Body() dto: ChartQueryDto,
		@Req() req: Request,
	) {
		const data = await this.entitySvc.getRevenueLineChart(
			'release',
			releaseId,
			dto,
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data });
	}

	@Post('trend-view/dsp/bar-chart')
	@ApiOperation({ summary: 'Trend view DSP bar chart for a release' })
	async trendViewDspBarChart(
		@Param('releaseId', ParseUUIDPipe) releaseId: string,
		@Body() dto: ChartQueryDto,
		@Req() req: Request,
	) {
		const data = await this.entitySvc.getTrendViewDspBarChart(
			'release',
			releaseId,
			dto,
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data });
	}

	@Post('trend-view/ter/bar-chart')
	@ApiOperation({ summary: 'Trend view territory bar chart for a release' })
	async trendViewTerritoryBarChart(
		@Param('releaseId', ParseUUIDPipe) releaseId: string,
		@Body() dto: ChartQueryDto,
		@Req() req: Request,
	) {
		const data = await this.entitySvc.getTrendViewTerritoryBarChart(
			'release',
			releaseId,
			dto,
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data });
	}

	@Post('revenue/dsp/bar-chart')
	@ApiOperation({ summary: 'Revenue DSP bar chart for a release' })
	async revenueDspBarChart(
		@Param('releaseId', ParseUUIDPipe) releaseId: string,
		@Body() dto: ChartQueryDto,
		@Req() req: Request,
	) {
		const data = await this.entitySvc.getRevenueDspBarChart(
			'release',
			releaseId,
			dto,
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data });
	}

	@Post('revenue/ter/bar-chart')
	@ApiOperation({ summary: 'Revenue territory bar chart for a release' })
	async revenueTerritoryBarChart(
		@Param('releaseId', ParseUUIDPipe) releaseId: string,
		@Body() dto: ChartQueryDto,
		@Req() req: Request,
	) {
		const data = await this.entitySvc.getRevenueTerritoryBarChart(
			'release',
			releaseId,
			dto,
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data });
	}

	@Post('dsp')
	@ApiOperation({ summary: 'Top DSPs của release (sortBy: views | revenue)' })
	async topDsps(
		@Param('releaseId', ParseUUIDPipe) releaseId: string,
		@Body() dto: EntityRankingQueryDto,
		@Req() req: Request,
	) {
		const data = await this.entitySvc.getTopDsps(
			'release',
			releaseId,
			dto,
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data });
	}

	@Post('ter')
	@ApiOperation({
		summary: 'Top territories của release (sortBy: views | revenue)',
	})
	async topTerritories(
		@Param('releaseId', ParseUUIDPipe) releaseId: string,
		@Body() dto: EntityRankingQueryDto,
		@Req() req: Request,
	) {
		const data = await this.entitySvc.getTopTerritories(
			'release',
			releaseId,
			dto,
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data });
	}
}
