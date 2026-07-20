import {
	Controller,
	Get,
	MessageEvent,
	Param,
	ParseUUIDPipe,
	Query,
	Res,
	Sse,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { AppResponseSuccess } from 'src/app.const';
import { User } from 'src/common/decorators/req.decorators';
import { UserReq } from 'src/common/interface/common.interface';
import { UserType } from 'src/modules/user/enum/user.enum';
import { ReleaseDspDeliveryProjection } from '../../application/projection/release-dsp-delivery.projection';
import { DistributionTimelineQueryService } from '../../application/queries/distribution-timeline-query.service';
import { TimelineQueryDto } from '../../application/queries/distribution-timeline.query';
import { DistributionSseService } from '../sse/distribution-sse.service';

@ApiTags('Distribution Orchestration')
@Controller('distributions')
export class DistributionController {
	constructor(
		private readonly timelineQuery: DistributionTimelineQueryService,
		private readonly sseService: DistributionSseService,
		private readonly projection: ReleaseDspDeliveryProjection,
	) {}

	/**
	 * GET /distributions/:id/timeline
	 * Admin: all events. User: milestone only. Cursor pagination.
	 */
	@Get(':id/timeline')
	@ApiOperation({
		summary: 'Lấy timeline sự kiện của distribution',
		description:
			'Admin: tất cả events. User: chỉ milestone events. Cursor pagination.',
	})
	@ApiParam({ name: 'id', format: 'uuid' })
	async getTimeline(
		@Param('id', ParseUUIDPipe) id: string,
		@Query() query: TimelineQueryDto,
		@User() user: UserReq,
	) {
		const level = user?.type === UserType.ADMIN ? undefined : 'milestone';

		const result = await this.timelineQuery.getTimeline({
			distributionId: id,
			level,
			cursor: query.cursor,
			limit: query.limit,
		});

		return AppResponseSuccess.COMMON(result);
	}

	/**
	 * GET /distributions/:id/stream  (SSE)
	 * Push new distribution events in real-time. cleanup() on client disconnect prevents memory leak.
	 */
	@Sse(':id/stream')
	@ApiOperation({ summary: 'SSE stream sự kiện realtime của distribution' })
	@ApiParam({ name: 'id', format: 'uuid' })
	streamEvents(
		@Param('id', ParseUUIDPipe) id: string,
		@Res() response: Response,
	): Observable<MessageEvent> {
		const stream = this.sseService.getOrCreateStream(id);
		// CRITICAL: cleanup Subject on disconnect to prevent Map memory leak
		response.on('close', () => this.sseService.cleanup(id));
		return stream;
	}

	/**
	 * GET /distributions/metrics
	 * Admin-only: SSE + projection metrics + projection lag for monitoring.
	 */
	@Get('metrics')
	@ApiOperation({
		summary: 'Metrics observability cho distribution pipeline',
	})
	async getMetrics() {
		const [lagSeconds, projectionMetrics, sseMetrics] = await Promise.all([
			this.projection.getLagSeconds(),
			Promise.resolve(this.projection.getMetrics()),
			Promise.resolve(this.sseService.getMetrics()),
		]);

		return AppResponseSuccess.COMMON({
			projection: { ...projectionMetrics, lagSeconds },
			sse: sseMetrics,
		});
	}
}
