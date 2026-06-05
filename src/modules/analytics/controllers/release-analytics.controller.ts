import { Body, Controller, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import {
	EntityOverviewQueryDto,
	EntityTimelineQueryDto,
} from '../dto/analytics-query.dto';
import { EntityAnalyticsService } from '../services/entity-analytics.service';

@ApiTags('Analytics - Release')
@Controller('analytics/release/:releaseId')
export class ReleaseAnalyticsController {
	constructor(private readonly entitySvc: EntityAnalyticsService) {}

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

	@Post('trend-view/dsp/timeline')
	@ApiOperation({
		summary: 'Trend view DSP timeline for a release (monthly)',
	})
	async trendViewTimeline(
		@Param('releaseId', ParseUUIDPipe) releaseId: string,
		@Body() dto: EntityTimelineQueryDto,
		@Req() req: Request,
	) {
		const data = await this.entitySvc.getTrendViewDspTimeline(
			'release',
			releaseId,
			dto,
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data });
	}

	@Post('sales-view/dsp/timeline')
	@ApiOperation({
		summary: 'Sales view DSP timeline for a release (monthly)',
	})
	async salesViewTimeline(
		@Param('releaseId', ParseUUIDPipe) releaseId: string,
		@Body() dto: EntityTimelineQueryDto,
		@Req() req: Request,
	) {
		const data = await this.entitySvc.getSalesViewDspTimeline(
			'release',
			releaseId,
			dto,
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data });
	}

	@Post('trend-view/dsp/timeline/daily')
	@ApiOperation({ summary: 'Trend view DSP daily timeline for a release' })
	async trendViewDailyTimeline(
		@Param('releaseId', ParseUUIDPipe) releaseId: string,
		@Body() dto: EntityTimelineQueryDto,
		@Req() req: Request,
	) {
		const data = await this.entitySvc.getTrendViewDspDailyTimeline(
			'release',
			releaseId,
			dto,
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data });
	}

	@Post('revenue/timeline')
	@ApiOperation({
		summary: 'Revenue timeline for a release (monthly, DSP breakdown)',
	})
	async revenueTimeline(
		@Param('releaseId', ParseUUIDPipe) releaseId: string,
		@Body() dto: EntityTimelineQueryDto,
		@Req() req: Request,
	) {
		const data = await this.entitySvc.getRevenueTimeline(
			'release',
			releaseId,
			dto,
			req.user!.tenantId,
		);
		return new ResponseSuccess({ data });
	}
}
