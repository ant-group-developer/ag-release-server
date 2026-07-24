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
import { TenantService } from 'src/modules/tenant/tenant.service';
import { UserType } from 'src/modules/user/enum/user.enum';
import { checkIsNotSystemTenant } from 'src/modules/user/utils/user-type.util';
import { ReleaseDspDeliveryProjection } from '../../application/projection/release-dsp-delivery.projection';
import { DistributionChannelQueryService } from '../../application/queries/distribution-channel-query.service';
import { DistributionListQueryService } from '../../application/queries/distribution-list-query.service';
import { DistributionTicketQueryService } from '../../application/queries/distribution-ticket-query.service';
import { DistributionTimelineQueryService } from '../../application/queries/distribution-timeline-query.service';
import { TimelineQueryDto } from '../../application/queries/distribution-timeline.query';
import { DistributionSseService } from '../sse/distribution-sse.service';
import { ListDistributionDto } from './dto/list-distribution.dto';

@ApiTags('Distribution Orchestration')
@Controller('distributions')
export class DistributionController {
	constructor(
		private readonly timelineQuery: DistributionTimelineQueryService,
		private readonly sseService: DistributionSseService,
		private readonly projection: ReleaseDspDeliveryProjection,
		private readonly ticketQuery: DistributionTicketQueryService,
		private readonly tenantService: TenantService,
		private readonly listQuery: DistributionListQueryService,
		private readonly channelQuery: DistributionChannelQueryService,
	) {}

	/**
	 * GET /distributions — list release-centric + DistributionState mới nhất.
	 * Tenant-scope: non-system tenant chỉ thấy release của tenant mình (khớp /releases).
	 */
	@Get()
	@ApiOperation({
		summary: 'Danh sách bản phát hành + trạng thái distribution',
		description:
			'Release-centric: mỗi release kèm DistributionState mới nhất + DSP live/total. Lọc theo distributionState.',
	})
	async list(@Query() query: ListDistributionDto, @User() user: UserReq) {
		if (user?.tenantId && checkIsNotSystemTenant(user.tenantId)) {
			query.tenantIds = [user.tenantId];
		}

		const result = await this.listQuery.list(query, {
			distributionState: query.distributionState,
		});
		return AppResponseSuccess.COMMON(result);
	}

	/**
	 * GET /distributions/by-release/:releaseId — distribution mới nhất của 1 release.
	 * Detail page dùng endpoint này thay vì gọi list rồi lấy phần tử đầu.
	 */
	@Get('by-release/:releaseId')
	@ApiOperation({
		summary: 'Lấy distribution mới nhất theo releaseId',
		description:
			'Trả distributionId + state + type + updatedAt hoặc null nếu chưa submit.',
	})
	@ApiParam({ name: 'releaseId', format: 'uuid' })
	async getByRelease(@Param('releaseId', ParseUUIDPipe) releaseId: string) {
		const info = await this.listQuery.getByRelease(releaseId);
		return AppResponseSuccess.COMMON(info);
	}

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
	 * GET /distributions/:id/tickets
	 * Liệt kê mọi ticket (flag lỗi) của distribution — reviewer REVIEW_REJECT + CI QA_FLAG + *_FAIL.
	 * Client render `items[]` chuẩn hoá. Tenant-scope: chỉ xem distribution thuộc tenant mình.
	 */
	@Get(':id/tickets')
	@ApiOperation({
		summary: 'Liệt kê flag lỗi (ticket) của distribution',
		description:
			'Gộp flag reviewer tạo + lỗi CI/QA/Spotify. Mỗi ticket có items[] chuẩn hoá.',
	})
	@ApiParam({ name: 'id', format: 'uuid' })
	async getTickets(
		@Param('id', ParseUUIDPipe) id: string,
		@User() user: UserReq,
	) {
		const items = await this.ticketQuery.listByDistribution(
			id,
			await this.resolveScope(user),
		);
		return AppResponseSuccess.COMMON(items);
	}

	/**
	 * GET /distributions/:id/channels
	 * Trạng thái phát hành từng DSP (channel_delivery). Tenant-scope.
	 */
	@Get(':id/channels')
	@ApiOperation({
		summary: 'Trạng thái phát hành từng DSP (channel) của distribution',
		description:
			'Đọc channel_delivery: state per-DSP (PENDING/DELIVERING/WAITING/LIVE/ISSUES/...), scheduledAt, ticketRef.',
	})
	@ApiParam({ name: 'id', format: 'uuid' })
	async getChannels(
		@Param('id', ParseUUIDPipe) id: string,
		@User() user: UserReq,
	) {
		const items = await this.channelQuery.listByDistribution(
			id,
			await this.resolveScope(user),
		);
		return AppResponseSuccess.COMMON(items);
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

	/**
	 * Tenant-scope: tập tenant được phép xem = tenant hiện tại + descendants.
	 * System admin → undefined (bỏ qua scope). Khớp resolveScope ở command controller.
	 */
	private async resolveScope(user: UserReq): Promise<string[] | undefined> {
		if (user?.type === UserType.ADMIN) return undefined;
		return this.tenantService.getDescendantIds(user.tenantId);
	}
}
