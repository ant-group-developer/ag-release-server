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
import { EntityOverviewQueryDto, EntityTimelineQueryDto } from '../dto/analytics-query.dto';
import { EntityAnalyticsService } from '../services/entity-analytics.service';

@ApiTags('Analytics - Label')
@Controller('analytics/label/:labelId')
export class LabelAnalyticsController {
	constructor(private readonly entitySvc: EntityAnalyticsService) {}

	@Post('overview')
	@ApiOperation({ summary: 'Overview stats for a label' })
	async overview(
		@Param('labelId') labelId: string,
		@Body() dto: EntityOverviewQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getOverview(
				'label',
				labelId,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('trend-view/dsp/timeline')
	@ApiOperation({ summary: 'Trend view DSP timeline for a label (monthly)' })
	async trendViewTimeline(
		@Param('labelId') labelId: string,
		@Body() dto: EntityTimelineQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getTrendViewDspTimeline(
				'label',
				labelId,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('sales-view/dsp/timeline')
	@ApiOperation({ summary: 'Sales view DSP timeline for a label (monthly)' })
	async salesViewTimeline(
		@Param('labelId') labelId: string,
		@Body() dto: EntityTimelineQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getSalesViewDspTimeline(
				'label',
				labelId,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('trend-view/dsp/timeline/daily')
	@ApiOperation({ summary: 'Trend view DSP daily timeline for a label' })
	async trendViewDailyTimeline(
		@Param('labelId') labelId: string,
		@Body() dto: EntityTimelineQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getTrendViewDspDailyTimeline(
				'label',
				labelId,
				dto,
				req.user!.tenantId,
			),
		});
	}

	@Post('revenue/timeline')
	@ApiOperation({
		summary: 'Revenue timeline for a label (monthly, DSP breakdown)',
	})
	async revenueTimeline(
		@Param('labelId') labelId: string,
		@Body() dto: EntityTimelineQueryDto,
		@Req() req: Request,
	) {
		return new ResponseSuccess({
			data: await this.entitySvc.getRevenueTimeline(
				'label',
				labelId,
				dto,
				req.user!.tenantId,
			),
		});
	}
}
