import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { User } from 'src/common/decorators/req.decorators';
import { UserReq } from 'src/common/interface/common.interface';
import { RequirePermissions } from 'src/modules/auth/decorators/auth.decorator';
import { Permission } from 'src/modules/permission/constants/permission.data.constant';
import { TenantService } from 'src/modules/tenant/tenant.service';
import { UserType } from 'src/modules/user/enum/user.enum';
import { DistributionCommandService } from '../../application/distribution-command.service';
import { ReviewDecisionDto } from './dto/review-decision.dto';
import { RetryDistributionDto } from './dto/retry-distribution.dto';
import { SubmitDistributionDto } from './dto/submit-distribution.dto';

/**
 * DistributionCommandController — write endpoints cho orchestration.
 *
 * Tách khỏi query controller (distribution.controller.ts) để phân chia CQRS rõ ràng.
 * Auth: JwtAuthGuard + PolicyGuard đã đăng ký global (APP_GUARD) → mọi endpoint yêu cầu JWT.
 * Khối A chỉ có POST /distributions (submit). Khối B/E thêm approve/reject/retry.
 */
@ApiTags('Distribution Orchestration')
@Controller('distributions')
export class DistributionCommandController {
	constructor(
		private readonly commandService: DistributionCommandService,
		private readonly tenantService: TenantService,
	) {}

	/**
	 * POST /distributions — submit distribution.
	 *
	 * Tạo snapshot bất biến từ release + enqueue SUBMIT vào dist.orchestrate.
	 * `tenantId` lấy từ user đã auth (KHÔNG nhận từ body → chống submit hộ tenant khác).
	 * Trả distributionId để client poll timeline/SSE.
	 */
	@Post()
	@ApiOperation({ summary: 'Submit release để phát hành (tạo distribution)' })
	async submit(
		@Body() body: SubmitDistributionDto,
		@User() user: UserReq,
	): Promise<{ distributionId: string }> {
		const distributionId = await this.commandService.submit({
			releaseId: body.releaseId,
			type: body.type,
			dspCodes: body.dspCodes,
			tenantId: user.tenantId,
			idempotencyKey: body.idempotencyKey,
		});

		return { distributionId };
	}

	/**
	 * POST /distributions/:id/review/approve.
	 *
	 * RBAC: permission `release_review.approve` (PolicyGuard). Ghi review row (approved) +
	 * enqueue APPROVE_REVIEW → aggregate tiếp (PROVISIONING_IDS/DELIVERING).
	 * Tenant-scope: reviewer chỉ duyệt release thuộc tenant mình (+descendants); system admin bỏ qua.
	 */
	@Post(':id/review/approve')
	@RequirePermissions(Permission.RELEASE_REVIEW.APPROVE)
	@ApiOperation({ summary: 'Duyệt distribution đang IN_REVIEW' })
	@ApiParam({ name: 'id', format: 'uuid' })
	async approveReview(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() body: ReviewDecisionDto,
		@User() user: UserReq,
	): Promise<{ ok: true }> {
		await this.commandService.approveReview({
			distributionId: id,
			reviewerId: user.id,
			allowedTenantIds: await this.resolveScope(user),
			idempotencyKey: body.idempotencyKey,
		});
		return { ok: true };
	}

	/**
	 * POST /distributions/:id/review/reject.
	 *
	 * RBAC: permission `release_review.reject`. Mở ticket REVIEW_REJECT + review row (rejected) +
	 * enqueue REJECT_REVIEW → aggregate về ACTION_REQUIRED kèm ticketRef + note. User sửa → RESUBMIT.
	 */
	@Post(':id/review/reject')
	@RequirePermissions(Permission.RELEASE_REVIEW.REJECT)
	@ApiOperation({ summary: 'Từ chối distribution đang IN_REVIEW' })
	@ApiParam({ name: 'id', format: 'uuid' })
	async rejectReview(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() body: ReviewDecisionDto,
		@User() user: UserReq,
	): Promise<{ ok: true }> {
		await this.commandService.rejectReview({
			distributionId: id,
			reviewerId: user.id,
			note: body.note,
			items: body.items,
			allowedTenantIds: await this.resolveScope(user),
			idempotencyKey: body.idempotencyKey,
		});
		return { ok: true };
	}

	/**
	 * POST /distributions/:id/tickets/:ticketId/resolve — user đánh dấu flag đã sửa.
	 *
	 * RBAC: permission update release (recovery cấp release). Tenant-scope như review.
	 * Chỉ đóng ticket (status resolved) — KHÔNG tự resubmit (user bấm Submit lại thủ công).
	 */
	@Post(':id/tickets/:ticketId/resolve')
	@RequirePermissions(
		Permission.RELEASE_AUDIO.UPDATE,
		Permission.RELEASE_VIDEO.UPDATE,
	)
	@ApiOperation({ summary: 'Đánh dấu flag lỗi đã được sửa (resolve ticket)' })
	@ApiParam({ name: 'id', format: 'uuid' })
	@ApiParam({ name: 'ticketId', format: 'uuid' })
	async resolveTicket(
		@Param('id', ParseUUIDPipe) id: string,
		@Param('ticketId', ParseUUIDPipe) ticketId: string,
		@User() user: UserReq,
	): Promise<{ ok: true }> {
		await this.commandService.resolveTicket({
			distributionId: id,
			ticketId,
			allowedTenantIds: await this.resolveScope(user),
		});
		return { ok: true };
	}

	/**
	 * POST /distributions/:id/retry — reset subtree ISSUES → resume (Khối E).
	 *
	 * RBAC: permission update release (`release_audio.update` OR `release_video.update`) — retry là
	 * hành động recovery cấp release. Tenant-scope như review. Body `channelIds?` chọn nhánh reset.
	 * Poison (retryCount≥3) → 409 (service pre-validate).
	 */
	@Post(':id/retry')
	@RequirePermissions(
		Permission.RELEASE_AUDIO.UPDATE,
		Permission.RELEASE_VIDEO.UPDATE,
	)
	@ApiOperation({
		summary: 'Retry distribution ISSUES (reset subtree → resume)',
	})
	@ApiParam({ name: 'id', format: 'uuid' })
	async retry(
		@Param('id', ParseUUIDPipe) id: string,
		@Body() body: RetryDistributionDto,
		@User() user: UserReq,
	): Promise<{ ok: true }> {
		await this.commandService.retry({
			distributionId: id,
			channelIds: body.channelIds,
			allowedTenantIds: await this.resolveScope(user),
			idempotencyKey: body.idempotencyKey,
		});
		return { ok: true };
	}

	/**
	 * Tenant-scope cho reviewer: tập tenant được phép duyệt = tenant hiện tại + descendants.
	 * System admin → undefined (bỏ qua scope, duyệt mọi tenant). Khớp `AccessControlService`
	 * (ADMIN = full-access cross-tenant).
	 */
	private async resolveScope(user: UserReq): Promise<string[] | undefined> {
		if (user?.type === UserType.ADMIN) return undefined;
		return this.tenantService.getDescendantIds(user.tenantId);
	}
}
