import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectEntityManager } from '@nestjs/typeorm';
import { Request } from 'express';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { Label } from 'src/modules/label/entities/label.entity';
import { EntityManager } from 'typeorm';
import {
	AnalyticsSummaryQueryDto,
	ChartQueryDto,
	RevenueChartQueryDto,
	EntityOverviewQueryDto,
	EntityRankingQueryDto,
} from '../dto/analytics-query.dto';
import { EntityAnalyticsService } from '../services/entity-analytics.service';

@ApiTags('Analytics - Label')
@Controller('analytics/label/:labelId')
export class LabelAnalyticsController {
	constructor(
		private readonly entitySvc: EntityAnalyticsService,
		@InjectEntityManager()
		private readonly entityManager: EntityManager,
	) {}

	private async getLabelTenant(labelId: string) {
		const label = await this.entityManager.findOne(Label, {
			where: { id: labelId },
			relations: ['tenant'],
			select: {
				id: true,
				tenant: {
					id: true,
					name: true,
					title: true,
					logo: true,
				},
			},
		});
		return label?.tenant
			? {
					id: label.tenant.id,
					name: label.tenant.name,
					title: label.tenant.title,
					logo: label.tenant.logo || null,
				}
			: null;
	}

	@Post('summary')
	@ApiOperation({ summary: 'Unified analytics summary for a label' })
	async summary(
		@Param('labelId') labelId: string,
		@Body() dto: AnalyticsSummaryQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getSummary(
				'label',
				labelId,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('overview')
	@ApiOperation({ summary: 'Overview stats for a label' })
	async overview(
		@Param('labelId') labelId: string,
		@Body() dto: EntityOverviewQueryDto,
		@Req() req: Request,
	) {
		const [data, tenant] = await Promise.all([
			this.entitySvc.getOverview(
				'label',
				labelId,
				dto,
				req.user!.tenantId,
			),
			this.getLabelTenant(labelId),
		]);
		return new ResponseSuccess({
			data,
			tenant,
		});
	}





	@Post('trend-view/line-chart')
	@ApiOperation({ summary: 'Trend view line chart for a label' })
	async trendViewLineChart(
		@Param('labelId') labelId: string,
		@Body() dto: ChartQueryDto,
		@Req() req: Request,
	) {
		const [data, tenant] = await Promise.all([
			this.entitySvc.getTrendViewLineChart(
				'label',
				labelId,
				dto,
				req.user!.tenantId,
			),
			this.getLabelTenant(labelId),
		]);
		return new ResponseSuccess({
			data,
			tenant,
		});
	}

	@Post('revenue/line-chart')
	@ApiOperation({ summary: 'Revenue line chart for a label' })
	async revenueLineChart(
		@Param('labelId') labelId: string,
		@Body() dto: RevenueChartQueryDto,
		@Req() req: Request,
	) {
		const [data, tenant] = await Promise.all([
			this.entitySvc.getRevenueLineChart(
				'label',
				labelId,
				dto,
				req.user!.tenantId,
			),
			this.getLabelTenant(labelId),
		]);
		return new ResponseSuccess({
			data,
			tenant,
		});
	}

	@Post('trend-view/dsp/bar-chart')
	@ApiOperation({ summary: 'Trend view DSP bar chart for a label' })
	async trendViewDspBarChart(
		@Param('labelId') labelId: string,
		@Body() dto: ChartQueryDto,
		@Req() req: Request,
	) {
		const [data, tenant] = await Promise.all([
			this.entitySvc.getTrendViewDspBarChart(
				'label',
				labelId,
				dto,
				req.user!.tenantId,
			),
			this.getLabelTenant(labelId),
		]);
		return new ResponseSuccess({
			data,
			tenant,
		});
	}

	@Post('trend-view/ter/bar-chart')
	@ApiOperation({ summary: 'Trend view territory bar chart for a label' })
	async trendViewTerritoryBarChart(
		@Param('labelId') labelId: string,
		@Body() dto: ChartQueryDto,
		@Req() req: Request,
	) {
		const [data, tenant] = await Promise.all([
			this.entitySvc.getTrendViewTerritoryBarChart(
				'label',
				labelId,
				dto,
				req.user!.tenantId,
			),
			this.getLabelTenant(labelId),
		]);
		return new ResponseSuccess({
			data,
			tenant,
		});
	}

	@Post('revenue/dsp/bar-chart')
	@ApiOperation({ summary: 'Revenue DSP bar chart for a label' })
	async revenueDspBarChart(
		@Param('labelId') labelId: string,
		@Body() dto: RevenueChartQueryDto,
		@Req() req: Request,
	) {
		const [data, tenant] = await Promise.all([
			this.entitySvc.getRevenueDspBarChart(
				'label',
				labelId,
				dto,
				req.user!.tenantId,
			),
			this.getLabelTenant(labelId),
		]);
		return new ResponseSuccess({
			data,
			tenant,
		});
	}

	@Post('revenue/ter/bar-chart')
	@ApiOperation({ summary: 'Revenue territory bar chart for a label' })
	async revenueTerritoryBarChart(
		@Param('labelId') labelId: string,
		@Body() dto: RevenueChartQueryDto,
		@Req() req: Request,
	) {
		const [data, tenant] = await Promise.all([
			this.entitySvc.getRevenueTerritoryBarChart(
				'label',
				labelId,
				dto,
				req.user!.tenantId,
			),
			this.getLabelTenant(labelId),
		]);
		return new ResponseSuccess({
			data,
			tenant,
		});
	}

	@Post('top-tracks')
	@ApiOperation({ summary: 'Top tracks của label (sortBy: views | usage | revenue)' })
	async topTracks(
		@Param('labelId') labelId: string,
		@Body() dto: EntityRankingQueryDto,
		@Req() req: Request,
	) {
		const [data, tenant] = await Promise.all([
			this.entitySvc.getTopTracks(
				'label',
				labelId,
				dto,
				req.user!.tenantId,
			),
			this.getLabelTenant(labelId),
		]);
		return new ResponseSuccess({ data, tenant });
	}

	@Post('top-releases')
	@ApiOperation({
		summary: 'Top releases của label (sortBy: views | usage | revenue)',
	})
	async topReleases(
		@Param('labelId') labelId: string,
		@Body() dto: EntityRankingQueryDto,
		@Req() req: Request,
	) {
		const [data, tenant] = await Promise.all([
			this.entitySvc.getTopReleases(
				'label',
				labelId,
				dto,
				req.user!.tenantId,
			),
			this.getLabelTenant(labelId),
		]);
		return new ResponseSuccess({ data, tenant });
	}

	@Post('dsp')
	@ApiOperation({ summary: 'Top DSPs của label (sortBy: views | usage | revenue)' })
	async topDsps(
		@Param('labelId') labelId: string,
		@Body() dto: EntityRankingQueryDto,
		@Req() req: Request,
	) {
		const data = await this.entitySvc.getTopDsps(
			'label',
			labelId,
			dto,
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data });
	}

	@Post('ter')
	@ApiOperation({
		summary: 'Top territories của label (sortBy: views | usage | revenue)',
	})
	async topTerritories(
		@Param('labelId') labelId: string,
		@Body() dto: EntityRankingQueryDto,
		@Req() req: Request,
	) {
		const data = await this.entitySvc.getTopTerritories(
			'label',
			labelId,
			dto,
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data });
	}
}
