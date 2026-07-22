import { Inject, Injectable, Optional } from '@nestjs/common';

import { DistributionState } from '../domain/distribution/distribution-state.enum';
import { Distribution } from '../domain/distribution/distribution.aggregate';
import { RetryExecutionPolicy } from '../domain/policies/retry-execution.policy';
import { Clock } from '../domain/ports/clock.port';
import { TicketService } from '../domain/ports/ticket-service.port';
import { TicketRef } from '../domain/value-objects/ticket-ref.vo';
import { TICKET_SERVICE } from '../infrastructure/adapters/postgres-ticket.adapter';
import { pickChannelQueue } from './channel-stage-to-queue';
import {
	ApplyChannelInputCommand,
	ApproveReviewCommand,
	DistributionCommand,
	FlagValidationErrorsCommand,
	MarkIdsProvisionedCommand,
	MarkPackageBuiltCommand,
	MarkValidatedCommand,
	RejectReviewCommand,
	ResetForRetryCommand,
	SubmitCommand,
} from './commands/distribution.command';
import { AggregateNotFoundError } from './errors/aggregate-not-found.error';
import { POLICY_RESOLVER, PolicyResolver } from './policy-resolver';
import { CLOCK } from './ports/clock.port.token';
import {
	DISTRIBUTION_REPOSITORY,
	DistributionRepository,
} from './ports/distribution-repository.port';
import { OutboxEntry } from './ports/outbox-entry';
import { TxContext, UNIT_OF_WORK, UnitOfWork } from './ports/unit-of-work.port';
import { QUEUES } from './ports/workflow-engine.port';

/**
 * OrchestrateHandler — MỘT VÒNG orchestrate = MỘT command.
 *
 * "Trạm trung chuyển" của queue `dist.orchestrate` (spec §Vòng lặp orchestrator):
 *   1. LOAD    : repo.load(id)  → Distribution|null (rehydrate từ Postgres)
 *   2. APPLY   : gọi transition tương ứng command → domain quyết state kế + tích luỹ event
 *                (KHÔNG side-effect, KHÔNG gọi SFTP/gRPC)
 *   3. PULL    : dist.pullDomainEvents()
 *   4. BUILD   : buildOutbox(dist, command) từ state MỚI
 *   5. PERSIST : (trong 1 transaction) UPDATE state (optlock) + UPSERT channels
 *                + INSERT events + INSERT outbox → atomic
 *   6. RELAY   : outbox-relay (Step 6) enqueue thật vào BullMQ
 *
 * Step 5 (mini): dispatch 10 command khớp aggregate + buildOutbox cover
 * mọi state đi tới workflow queue. Runners thật (Step 5b) sẽ CONSUME
 * các queue này và enqueue command STEP_DONE về `dist.orchestrate`.
 *
 * Error handling:
 *   · AggregateNotFoundError → command non-SUBMIT mà load null.
 *   · OptimisticLockError    → 2 worker đua → BullMQ retry job.
 *   · Domain error (Invalid/Invariant/RetryLimit) → bubble, worker log + DLQ.
 */
@Injectable()
export class OrchestrateHandler {
	constructor(
		@Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
		@Inject(DISTRIBUTION_REPOSITORY)
		private readonly repo: DistributionRepository,
		@Inject(POLICY_RESOLVER) private readonly policies: PolicyResolver,
		@Inject(CLOCK) private readonly clock: Clock,
		// Optional: chỉ Khối E cần (resolve ticket khi RESET). Test cũ dựng handler 4-arg vẫn chạy.
		@Optional()
		@Inject(TICKET_SERVICE)
		private readonly ticketService?: TicketService,
	) {}

	async handle(command: DistributionCommand): Promise<void> {
		// Khối E: chụp ticketRef của channel ISSUES SẼ bị reset (trong tx) để resolve SAU commit.
		let ticketsToResolve: string[] = [];

		await this.uow.run(async (ctx) => {
			const dist = await this.loadOrCreate(ctx, command);
			const prevState = dist.state;
			if (command.type === 'RESET_FOR_RETRY') {
				ticketsToResolve = this.collectResolvableTickets(dist, command);
			}
			this.applyCommand(dist, command);
			const events = dist.pullDomainEvents();
			const outbox = this.buildOutbox(dist, command, prevState);
			await this.repo.saveWithOutbox(ctx, dist, events, outbox);
		});

		// Best-effort resolve NGOÀI tx: reset đã commit; nếu resolve lỗi thì job có thể retry
		// nhưng reset idempotent (channel đã rời ISSUES) → không reset kép. Nuốt lỗi resolve.
		await this.resolveTickets(ticketsToResolve);
	}

	// ─── LOAD / CREATE ────────────────────────────────────────────────────

	private async loadOrCreate(
		ctx: TxContext,
		command: DistributionCommand,
	): Promise<Distribution> {
		const existing = await this.repo.load(ctx, command.distributionId);
		if (existing) return existing;

		if (command.type === 'SUBMIT') {
			return Distribution.create(command.create);
		}
		throw new AggregateNotFoundError(command.distributionId);
	}

	// ─── APPLY ────────────────────────────────────────────────────────────

	private applyCommand(
		dist: Distribution,
		command: DistributionCommand,
	): void {
		switch (command.type) {
			case 'SUBMIT':
				return this.applySubmit(dist, command);
			case 'MARK_VALIDATED':
				return this.applyMarkValidated(dist, command);
			case 'FLAG_VALIDATION_ERRORS':
				return this.applyFlagValidationErrors(dist, command);
			case 'APPROVE_REVIEW':
				return this.applyApproveReview(dist, command);
			case 'REJECT_REVIEW':
				return this.applyRejectReview(dist, command);
			case 'RESUBMIT':
				dist.resubmit(this.clock);
				return;
			case 'MARK_IDS_PROVISIONED':
				return this.applyMarkIdsProvisioned(dist, command);
			case 'MARK_PACKAGE_BUILT':
				return this.applyMarkPackageBuilt(dist, command);
			case 'APPLY_CHANNEL_INPUT':
				return this.applyChannelInput(dist, command);
			case 'RESET_FOR_RETRY':
				return this.applyResetForRetry(dist, command);
			case 'MARK_TAKEN_DOWN':
				return this.applyMarkTakenDown(dist);
		}
	}

	private applySubmit(dist: Distribution, _cmd: SubmitCommand): void {
		dist.submit(this.clock);
	}

	private applyMarkValidated(
		dist: Distribution,
		cmd: MarkValidatedCommand,
	): void {
		dist.markValidated(
			this.policies.resolve(dist.type),
			cmd.requiresReview,
			this.clock,
		);
	}

	private applyFlagValidationErrors(
		dist: Distribution,
		cmd: FlagValidationErrorsCommand,
	): void {
		dist.flagValidationErrors(cmd.ticketRef, cmd.errors, this.clock);
	}

	private applyApproveReview(
		dist: Distribution,
		cmd: ApproveReviewCommand,
	): void {
		dist.approveReview(
			cmd.reviewerId,
			this.policies.resolve(dist.type),
			this.clock,
		);
	}

	private applyRejectReview(
		dist: Distribution,
		cmd: RejectReviewCommand,
	): void {
		dist.rejectReview(cmd.reviewerId, cmd.ticketRef, cmd.note, this.clock);
	}

	private applyMarkIdsProvisioned(
		dist: Distribution,
		cmd: MarkIdsProvisionedCommand,
	): void {
		dist.markIdsProvisioned(cmd.upc, this.clock);
	}

	private applyMarkPackageBuilt(
		dist: Distribution,
		cmd: MarkPackageBuiltCommand,
	): void {
		dist.markPackageBuilt(
			cmd.packageUri,
			this.policies.resolve(dist.type),
			this.clock,
		);
	}

	private applyChannelInput(
		dist: Distribution,
		cmd: ApplyChannelInputCommand,
	): void {
		dist.applyChannelInput(cmd.channelId, cmd.input, this.clock);
	}

	/**
	 * RESET_FOR_RETRY (quyết định #3): wrap policy gốc vào RetryExecutionPolicy — chỉ nó
	 * `canRetry()=true`. Không wrap → INITIAL/UPDATE/TAKEDOWN policy trả false → luôn throw.
	 * Phần còn lại delegate policy gốc → channel reset resume đúng process. Không đụng DB (không
	 * thêm cột wrapped_type): RETRY mutate aggregate cũ, type trong DB giữ nguyên.
	 */
	private applyResetForRetry(
		dist: Distribution,
		cmd: ResetForRetryCommand,
	): void {
		const base = this.policies.resolve(dist.type);
		const retryPolicy = new RetryExecutionPolicy(base);
		dist.resetForRetry(cmd.scope, retryPolicy, this.clock);
	}

	private applyMarkTakenDown(dist: Distribution): void {
		dist.markTakenDown(this.policies.resolve(dist.type), this.clock);
	}

	// ─── Khối E: resolve ticket khi RESET ─────────────────────────────────

	/**
	 * Ticket của channel SẼ bị reset (giao với scope): scope.channelIds nếu có, else mọi channel
	 * ISSUES. Đọc TRƯỚC apply() vì sau reset channel rời ISSUES + ticketRef vẫn giữ trên entity.
	 */
	private collectResolvableTickets(
		dist: Distribution,
		cmd: ResetForRetryCommand,
	): string[] {
		const target = cmd.scope.channelIds;
		return dist.channels
			.filter((c) => c.state === 'ISSUES' && !!c.ticketRef)
			.filter((c) => !target || target.includes(c.channelId))
			.map((c) => c.ticketRef as string);
	}

	private async resolveTickets(refs: string[]): Promise<void> {
		if (!this.ticketService || refs.length === 0) return;
		for (const ref of refs) {
			try {
				await this.ticketService.resolve({
					ticket: TicketRef.create(ref),
				});
			} catch {
				// best-effort: reset đã commit; ticket còn open không chặn luồng.
			}
		}
	}

	// ─── OUTBOX derivation ────────────────────────────────────────────────

	/**
	 * Sinh outbox từ state SAU apply(). "State là mệnh đề: 'bước kế cần làm gì'".
	 *
	 * Mapping state → queue:
	 *   · PROVISIONING_IDS  → dist.provision-id       (runner Step 5b)
	 *   · BUILDING_PACKAGE  → dist.build-package      (runner Step 5b)
	 *   · DELIVERING        → 1 job/channel PENDING vào dist.orchestrate với
	 *                          APPLY_CHANNEL_INPUT STEP_DONE... NO — DELIVERING
	 *                          giao cho step-runner (upload/export/import-check)
	 *                          per-channel. Step 5 mini KHÔNG derive per-channel
	 *                          (tránh coupling handler với process shape) →
	 *                          Step 5b làm khi có runner.
	 *   · terminal/VALIDATING/IN_REVIEW/ACTION_REQUIRED → outbox rỗng (chờ
	 *     external input: validator, reviewer, user resubmit).
	 *
	 * jobId deterministic: `${distId}:${newState}:${key}` — chống trùng ở tầng
	 * DB (UNIQUE outbox_event.job_id) + BullMQ layer 1.
	 *
	 * NOTE: prevState để lại làm hook cho Step 5b (VD phát STEP_FAILED khi 1
	 * transition failure sinh outbox reset). Hiện chưa dùng.
	 */
	private buildOutbox(
		dist: Distribution,
		command: DistributionCommand,
		_prevState: DistributionState,
	): OutboxEntry[] {
		const jobId = `${dist.id}:${dist.state}:${command.key}`;
		const payload = {
			distributionId: dist.id,
			correlationId: dist.correlationId,
			key: command.key,
		};

		switch (dist.state) {
			case DistributionState.VALIDATING:
				return [{ queue: QUEUES.VALIDATE, payload, jobId }];
			case DistributionState.PROVISIONING_IDS:
				return [{ queue: QUEUES.PROVISION_ID, payload, jobId }];
			case DistributionState.BUILDING_PACKAGE:
				return [{ queue: QUEUES.BUILD_PACKAGE, payload, jobId }];
			case DistributionState.DELIVERING:
				return this.buildDeliveringOutbox(dist, command.key, payload);
			default:
				return [];
		}
	}

	/**
	 * DELIVERING: 1 job / channel non-terminal → queue derived from stage.
	 * jobId = `${distId}:${channelId}:${stage.key}:${key}` — deterministic + per-channel.
	 * Terminal channels emit nothing. Unknown stage kind = skipped (log ở runner Step 5b).
	 */
	private buildDeliveringOutbox(
		dist: Distribution,
		key: string,
		basePayload: {
			distributionId: string;
			correlationId: string;
			key: string;
		},
	): OutboxEntry[] {
		const entries: OutboxEntry[] = [];
		for (const channel of dist.channels) {
			const queue = pickChannelQueue(channel);
			if (!queue) continue;
			const stageKey = channel.currentStage?.key ?? '?';
			entries.push({
				queue,
				payload: { ...basePayload, channelId: channel.channelId },
				jobId: `${dist.id}:${channel.channelId}:${stageKey}:${key}`,
			});
		}
		return entries;
	}
}
