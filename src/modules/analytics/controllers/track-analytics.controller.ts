import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { EntityAnalyticsService } from '../services/entity-analytics.service';
import { EntityOverviewQueryDto, EntityTimelineQueryDto } from '../dto/analytics-query.dto';
import { ResponseSuccess } from 'src/common/dtos/common.response.dto';
import { Request } from 'express';

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
}
