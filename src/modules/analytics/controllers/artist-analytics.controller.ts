import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { EntityAnalyticsService } from '../services/entity-analytics.service';
import { EntityOverviewQueryDto, EntityTimelineQueryDto } from '../dto/analytics-query.dto';
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
}
