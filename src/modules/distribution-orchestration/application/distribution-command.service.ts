import {
	ConflictException,
	ForbiddenException,
	Inject,
	Injectable,
	NotFoundException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

import { DistributionState } from '../domain/distribution/distribution-state.enum';
import { TicketService } from '../domain/ports/ticket-service.port';
import { ExecutionTypeEnum } from '../domain/value-objects/execution-type.enum';
import { IdempotencyKey } from '../domain/value-objects/idempotency-key.vo';
import { TicketIssueItem } from '../domain/value-objects/ticket-metadata.vo';
import { TicketReason } from '../domain/value-objects/ticket-ref.vo';
import { TICKET_SERVICE } from '../infrastructure/adapters/postgres-ticket.adapter';
import {
	ApproveReviewCommand,
	RejectReviewCommand,
	ResetForRetryCommand,
	SubmitCommand,
} from './commands/distribution.command';
import {
	DISTRIBUTION_REPOSITORY,
	DistributionRepository,
} from './ports/distribution-repository.port';
import {
	DSP_SPEC_RESOLVER,
	DspSpecResolver,
} from './ports/dsp-spec-resolver.port';
import {
	RELEASE_SNAPSHOT_WRITER,
	ReleaseSnapshotWriter,
} from './ports/release-snapshot-writer.port';
import {
	REVIEW_REPOSITORY,
	ReviewRepository,
} from './ports/review-repository.port';
import { UNIT_OF_WORK, UnitOfWork } from './ports/unit-of-work.port';
import {
	EnqueueOptions,
	QUEUES,
	WORKFLOW_ENGINE,
	WorkflowEnginePort,
} from './ports/workflow-engine.port';

/**
 * DistributionCommandService — entry point cho HTTP → queue.
 *
 * Khối A implement `submit`: tạo snapshot bất biến từ release → enqueue SUBMIT.
 * Khối B/E thêm approveReview/rejectReview/retry.
 */
@Injectable()
export class DistributionCommandService {
	constructor(
		@Inject(WORKFLOW_ENGINE)
		private readonly workflowEngine: WorkflowEnginePort,
		@Inject(RELEASE_SNAPSHOT_WRITER)
		private readonly snapshotWriter: ReleaseSnapshotWriter,
		@Inject(REVIEW_REPOSITORY)
		private readonly reviewRepo: ReviewRepository,
		@Inject(TICKET_SERVICE)
		private readonly ticketService: TicketService,
		@Inject(UNIT_OF_WORK)
		private readonly uow: UnitOfWork,
		@Inject(DISTRIBUTION_REPOSITORY)
		private readonly repo: DistributionRepository,
		@Inject(DSP_SPEC_RESOLVER)
		private readonly dspSpecResolver: DspSpecResolver,
	) {}

	/**
	 * Submit distribution — tạo snapshot bất biến + enqueue SUBMIT command.
	 *
	 * @returns distributionId
	 */
	async submit(input: {
		releaseId: string;
		tenantId: string;
		type: ExecutionTypeEnum;
		dspCodes: string[];
		idempotencyKey?: string;
	}): Promise<string> {
		const distributionId = uuidv4();
		const correlationId = uuidv4();

		// Idempotency ổn định: client cấp, hoặc derive từ releaseId+type
		// → double-submit cùng release+type dùng chung key (jobId dedupe chặn trùng).
		const key =
			input.idempotencyKey ?? `submit:${input.releaseId}:${input.type}`;

		// 1. Resolve dspCodes → ChannelDeliverySpec[] (topology/aggregator/hasDeal server-side)
		const channelSpecs = await this.dspSpecResolver.resolveMany(
			input.dspCodes,
		);

		// 2. Tạo snapshot bất biến (chụp release tại thời điểm submit)
		const snapshotId = await this.snapshotWriter.createFromRelease(
			input.releaseId,
		);

		// 3. Enqueue SUBMIT với snapshotId vừa tạo
		const command: SubmitCommand = {
			type: 'SUBMIT',
			distributionId,
			key,
			create: {
				id: distributionId,
				releaseId: input.releaseId,
				snapshotId,
				tenantId: input.tenantId,
				type: input.type,
				correlationId,
				channelSpecs,
			},
		};

		const opts: EnqueueOptions = {
			jobId: `${distributionId}:SUBMIT:${key}`,
			attempts: 1, // SUBMIT idempotent, không retry
		};

		await this.workflowEngine.enqueue(
			QUEUES.ORCHESTRATE,
			{ distributionId, correlationId, key, command },
			opts,
		);

		return distributionId;
	}

	/**
	 * Approve review — ghi review row (approved) + enqueue APPROVE_REVIEW.
	 *
	 * Aggregate `approveReview` tự quyết state kế (PROVISIONING_IDS/DELIVERING) → buildOutbox
	 * enqueue bước tiếp. Human signal = resume, không cần cơ chế riêng (chỉ 1 command).
	 */
	async approveReview(input: {
		distributionId: string;
		reviewerId: string;
		allowedTenantIds?: string[];
		idempotencyKey?: string;
	}): Promise<void> {
		const { distributionId, reviewerId } = input;
		await this.assertReviewable(distributionId, input.allowedTenantIds);
		const key = input.idempotencyKey ?? `review-approve:${distributionId}`;

		const reviewId = await this.reviewRepo.create(distributionId);
		await this.reviewRepo.decide({
			id: reviewId,
			reviewerId,
			status: 'approved',
		});

		const command: ApproveReviewCommand = {
			type: 'APPROVE_REVIEW',
			distributionId,
			key,
			reviewerId,
		};
		await this.enqueueOrchestrate(distributionId, key, command);
	}

	/**
	 * Reject review — mở ticket REVIEW_REJECT → ghi review row (rejected) → enqueue REJECT_REVIEW.
	 *
	 * Aggregate `rejectReview` → ACTION_REQUIRED kèm ticketRef + note; user sửa → RESUBMIT.
	 * Ticket key ổn định theo distributionId → double-reject KHÔNG tạo ticket kép.
	 */
	async rejectReview(input: {
		distributionId: string;
		reviewerId: string;
		note?: string;
		items?: TicketIssueItem[];
		allowedTenantIds?: string[];
		idempotencyKey?: string;
	}): Promise<void> {
		const { distributionId, reviewerId, note, items } = input;
		await this.assertReviewable(distributionId, input.allowedTenantIds);
		const key = input.idempotencyKey ?? `review-reject:${distributionId}`;

		const ticketRef = await this.ticketService.open({
			distributionId,
			reason: TicketReason.REVIEW_REJECT,
			detail: note?.trim() || 'Review rejected by reviewer',
			// Ghi flag cấu trúc reviewer tạo → client render chung với lỗi CI/QA.
			metadata: items && items.length > 0 ? { items } : undefined,
			key: IdempotencyKey.create(`review-reject:${distributionId}`),
		});

		const reviewId = await this.reviewRepo.create(distributionId);
		await this.reviewRepo.decide({
			id: reviewId,
			reviewerId,
			status: 'rejected',
			note,
		});

		const command: RejectReviewCommand = {
			type: 'REJECT_REVIEW',
			distributionId,
			key,
			reviewerId,
			ticketRef: ticketRef.value,
			note: note ?? '',
		};
		await this.enqueueOrchestrate(distributionId, key, command);
	}

	/**
	 * Resolve 1 ticket (flag lỗi) — user đánh dấu đã sửa.
	 *
	 * KHÔNG tự resume aggregate (user RESUBMIT thủ công — v1). Chỉ đóng ticket.
	 * Tenant-scope như review; ticket phải thuộc đúng distribution (404 nếu không).
	 */
	async resolveTicket(input: {
		distributionId: string;
		ticketId: string;
		allowedTenantIds?: string[];
	}): Promise<void> {
		await this.assertReviewable(
			input.distributionId,
			input.allowedTenantIds,
			{
				requireInReview: false,
			},
		);

		const ok = await this.ticketService.resolveScoped({
			distributionId: input.distributionId,
			ticketId: input.ticketId,
		});
		if (!ok) {
			throw new NotFoundException(
				'Ticket not found for this distribution',
			);
		}
	}

	/**
	 * Guard trước khi ghi review + enqueue:
	 *  · distribution tồn tại (404)
	 *  · tenant-scope: reviewer chỉ duyệt release thuộc tenant mình (+descendants). `allowedTenantIds`
	 *    = undefined nghĩa là bỏ qua scope (system admin — guard đã cho qua). (403)
	 *  · state phải IN_REVIEW (409) — tránh approve/reject nhầm khi đã tiếp/đã reject.
	 */
	private async assertReviewable(
		distributionId: string,
		allowedTenantIds?: string[],
		opts: { requireInReview?: boolean } = {},
	): Promise<void> {
		const { requireInReview = true } = opts;
		const dist = await this.uow.run((ctx) =>
			this.repo.load(ctx, distributionId),
		);
		if (!dist) {
			throw new NotFoundException(
				`Distribution ${distributionId} not found`,
			);
		}
		if (allowedTenantIds && !allowedTenantIds.includes(dist.tenantId)) {
			throw new ForbiddenException(
				'You cannot review a distribution outside your tenant scope',
			);
		}
		if (requireInReview && dist.state !== DistributionState.IN_REVIEW) {
			throw new ConflictException(
				`Distribution ${distributionId} is not IN_REVIEW (current: ${dist.state})`,
			);
		}
	}

	/**
	 * Retry (Khối E) — reset subtree ISSUES → resume DELIVERING (admin/permission).
	 *
	 * Pre-validate ĐỒNG BỘ (reset chạy async ở worker nên lỗi domain không về được HTTP):
	 *  · tồn tại (404) · tenant-scope (403)
	 *  · state phải PARTIALLY_DISTRIBUTED | FAILED (409) — chỉ 2 state này resetForRetry hợp lệ
	 *  · poison: retriesExhausted → 409 (không retry thêm, cần xử lý thủ công)
	 * Handler wrap RetryExecutionPolicy + resolve ticket channel được reset.
	 */
	async retry(input: {
		distributionId: string;
		channelIds?: string[];
		allowedTenantIds?: string[];
		idempotencyKey?: string;
	}): Promise<void> {
		const { distributionId, channelIds } = input;
		const dist = await this.uow.run((ctx) =>
			this.repo.load(ctx, distributionId),
		);
		if (!dist) {
			throw new NotFoundException(
				`Distribution ${distributionId} not found`,
			);
		}
		if (
			input.allowedTenantIds &&
			!input.allowedTenantIds.includes(dist.tenantId)
		) {
			throw new ForbiddenException(
				'You cannot retry a distribution outside your tenant scope',
			);
		}
		if (
			dist.state !== DistributionState.PARTIALLY_DISTRIBUTED &&
			dist.state !== DistributionState.FAILED
		) {
			throw new ConflictException(
				`Distribution ${distributionId} is not retryable (current: ${dist.state})`,
			);
		}
		if (dist.retriesExhausted) {
			throw new ConflictException(
				`Distribution ${distributionId} exceeded retry limit (poison) — manual handling required`,
			);
		}

		const key = input.idempotencyKey ?? `retry:${distributionId}`;
		const command: ResetForRetryCommand = {
			type: 'RESET_FOR_RETRY',
			distributionId,
			key,
			scope: channelIds ? { channelIds } : {},
		};
		await this.enqueueOrchestrate(distributionId, key, command);
	}

	/** Enqueue 1 command vào dist.orchestrate với jobId ổn định (dedupe double-submit). */
	private async enqueueOrchestrate(
		distributionId: string,
		key: string,
		command:
			| ApproveReviewCommand
			| RejectReviewCommand
			| ResetForRetryCommand,
	): Promise<void> {
		const opts: EnqueueOptions = {
			jobId: `${distributionId}:${command.type}:${key}`,
			attempts: 1,
		};
		await this.workflowEngine.enqueue(
			QUEUES.ORCHESTRATE,
			{ distributionId, correlationId: distributionId, key, command },
			opts,
		);
	}
}
