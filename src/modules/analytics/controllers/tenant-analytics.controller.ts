import {
	Body,
	Controller,
	ForbiddenException,
	Param,
	Post,
	Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { TenantService } from 'src/modules/tenant/tenant.service';
import { checkIsSystemTenant } from 'src/modules/user/utils/user-type.util';
import {
	ChartQueryDto,
	EntityOverviewQueryDto,
	EntityRankingQueryDto,
	EntityTimelineQueryDto,
} from '../dto/analytics-query.dto';
import { EntityAnalyticsService } from '../services/entity-analytics.service';

@ApiTags('Analytics - Tenant')
@Controller('analytics/tenant/:tenantId')
export class TenantAnalyticsController {
	constructor(
		private readonly entitySvc: EntityAnalyticsService,
		private readonly tenantService: TenantService,
	) {}

	private async validateTenantAccess(
		userTenantId: string,
		targetTenantId: string,
	) {
		const isSystem = checkIsSystemTenant(userTenantId);
		if (isSystem) {
			return;
		}
		const allowedDescendants =
			await this.tenantService.getDescendantIds(userTenantId);
		if (!allowedDescendants.includes(targetTenantId)) {
			throw new ForbiddenException(
				`You do not have access to tenant ${targetTenantId}`,
			);
		}
	}

	@Post('overview')
	@ApiOperation({ summary: 'Overview stats for a tenant' })
	async overview(
		@Param('tenantId') tenantId: string,
		@Body() dto: EntityOverviewQueryDto,
		@Req() req: Request,
	) {
		await this.validateTenantAccess(req.user!.tenantId, tenantId);
		return new ResponseSuccess({
			data: await this.entitySvc.getOverview(
				'tenant',
				tenantId,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('trend-view/dsp/timeline')
	@ApiOperation({ summary: 'Trend view DSP timeline for a tenant (monthly)' })
	async trendViewTimeline(
		@Param('tenantId') tenantId: string,
		@Body() dto: EntityTimelineQueryDto,
		@Req() req: Request,
	) {
		await this.validateTenantAccess(req.user!.tenantId, tenantId);
		return new ResponseSuccess({
			data: await this.entitySvc.getTrendViewDspTimeline(
				'tenant',
				tenantId,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('sales-view/dsp/timeline')
	@ApiOperation({ summary: 'Sales view DSP timeline for a tenant (monthly)' })
	async salesViewTimeline(
		@Param('tenantId') tenantId: string,
		@Body() dto: EntityTimelineQueryDto,
		@Req() req: Request,
	) {
		await this.validateTenantAccess(req.user!.tenantId, tenantId);
		return new ResponseSuccess({
			data: await this.entitySvc.getSalesViewDspTimeline(
				'tenant',
				tenantId,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('trend-view/dsp/timeline/daily')
	@ApiOperation({ summary: 'Trend view DSP daily timeline for a tenant' })
	async trendViewDailyTimeline(
		@Param('tenantId') tenantId: string,
		@Body() dto: EntityTimelineQueryDto,
		@Req() req: Request,
	) {
		await this.validateTenantAccess(req.user!.tenantId, tenantId);
		return new ResponseSuccess({
			data: await this.entitySvc.getTrendViewDspDailyTimeline(
				'tenant',
				tenantId,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('revenue/timeline')
	@ApiOperation({
		summary: 'Revenue timeline for a tenant (monthly, DSP breakdown)',
	})
	async revenueTimeline(
		@Param('tenantId') tenantId: string,
		@Body() dto: EntityTimelineQueryDto,
		@Req() req: Request,
	) {
		await this.validateTenantAccess(req.user!.tenantId, tenantId);
		return new ResponseSuccess({
			data: await this.entitySvc.getRevenueTimeline(
				'tenant',
				tenantId,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('trend-view/line-chart')
	@ApiOperation({ summary: 'Trend view line chart for a tenant' })
	async trendViewLineChart(
		@Param('tenantId') tenantId: string,
		@Body() dto: ChartQueryDto,
		@Req() req: Request,
	) {
		await this.validateTenantAccess(req.user!.tenantId, tenantId);
		return new ResponseSuccess({
			data: await this.entitySvc.getTrendViewLineChart(
				'tenant',
				tenantId,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('revenue/line-chart')
	@ApiOperation({ summary: 'Revenue line chart for a tenant' })
	async revenueLineChart(
		@Param('tenantId') tenantId: string,
		@Body() dto: ChartQueryDto,
		@Req() req: Request,
	) {
		await this.validateTenantAccess(req.user!.tenantId, tenantId);
		return new ResponseSuccess({
			data: await this.entitySvc.getRevenueLineChart(
				'tenant',
				tenantId,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('trend-view/dsp/bar-chart')
	@ApiOperation({ summary: 'Trend view DSP bar chart for a tenant' })
	async trendViewDspBarChart(
		@Param('tenantId') tenantId: string,
		@Body() dto: ChartQueryDto,
		@Req() req: Request,
	) {
		await this.validateTenantAccess(req.user!.tenantId, tenantId);
		return new ResponseSuccess({
			data: await this.entitySvc.getTrendViewDspBarChart(
				'tenant',
				tenantId,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('trend-view/ter/bar-chart')
	@ApiOperation({ summary: 'Trend view territory bar chart for a tenant' })
	async trendViewTerritoryBarChart(
		@Param('tenantId') tenantId: string,
		@Body() dto: ChartQueryDto,
		@Req() req: Request,
	) {
		await this.validateTenantAccess(req.user!.tenantId, tenantId);
		return new ResponseSuccess({
			data: await this.entitySvc.getTrendViewTerritoryBarChart(
				'tenant',
				tenantId,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('revenue/dsp/bar-chart')
	@ApiOperation({ summary: 'Revenue DSP bar chart for a tenant' })
	async revenueDspBarChart(
		@Param('tenantId') tenantId: string,
		@Body() dto: ChartQueryDto,
		@Req() req: Request,
	) {
		await this.validateTenantAccess(req.user!.tenantId, tenantId);
		return new ResponseSuccess({
			data: await this.entitySvc.getRevenueDspBarChart(
				'tenant',
				tenantId,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('revenue/ter/bar-chart')
	@ApiOperation({ summary: 'Revenue territory bar chart for a tenant' })
	async revenueTerritoryBarChart(
		@Param('tenantId') tenantId: string,
		@Body() dto: ChartQueryDto,
		@Req() req: Request,
	) {
		await this.validateTenantAccess(req.user!.tenantId, tenantId);
		return new ResponseSuccess({
			data: await this.entitySvc.getRevenueTerritoryBarChart(
				'tenant',
				tenantId,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('top-tracks')
	@ApiOperation({
		summary: 'Top tracks của tenant (sortBy: views | revenue)',
	})
	async topTracks(
		@Param('tenantId') tenantId: string,
		@Body() dto: EntityRankingQueryDto,
		@Req() req: Request,
	) {
		await this.validateTenantAccess(req.user!.tenantId, tenantId);
		return new ResponseSuccess({
			data: await this.entitySvc.getTopTracks(
				'tenant',
				tenantId,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('top-releases')
	@ApiOperation({
		summary: 'Top releases của tenant (sortBy: views | revenue)',
	})
	async topReleases(
		@Param('tenantId') tenantId: string,
		@Body() dto: EntityRankingQueryDto,
		@Req() req: Request,
	) {
		await this.validateTenantAccess(req.user!.tenantId, tenantId);
		return new ResponseSuccess({
			data: await this.entitySvc.getTopReleases(
				'tenant',
				tenantId,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('dsp')
	@ApiOperation({ summary: 'Top DSPs của tenant (sortBy: views | revenue)' })
	async topDsps(
		@Param('tenantId') tenantId: string,
		@Body() dto: EntityRankingQueryDto,
		@Req() req: Request,
	) {
		await this.validateTenantAccess(req.user!.tenantId, tenantId);
		return new ResponseSuccess({
			data: await this.entitySvc.getTopDsps(
				'tenant',
				tenantId,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('ter')
	@ApiOperation({
		summary: 'Top territories của tenant (sortBy: views | revenue)',
	})
	async topTerritories(
		@Param('tenantId') tenantId: string,
		@Body() dto: EntityRankingQueryDto,
		@Req() req: Request,
	) {
		await this.validateTenantAccess(req.user!.tenantId, tenantId);
		return new ResponseSuccess({
			data: await this.entitySvc.getTopTerritories(
				'tenant',
				tenantId,
				dto,
				req.user!.tenantId,
			),
		});
	}
}
