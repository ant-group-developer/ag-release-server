import { Inject, Injectable } from '@nestjs/common';

import { DistributionState } from '../domain/distribution/distribution-state.enum';
import { Distribution } from '../domain/distribution/distribution.aggregate';
import { Clock } from '../domain/ports/clock.port';
import {
	DistributionCommand,
	MarkValidatedCommand,
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

/**
 * OrchestrateHandler — MỘT VÒNG orchestrate = MỘT command.
 *
 * Đây là "trạm trung chuyển" của queue `dist.orchestrate` (spec §Vòng lặp orchestrator):
 *
 *   1. LOAD    : repo.load(id)  → Distribution|null (rehydrate từ Postgres)
 *   2. APPLY   : gọi transition tương ứng command → domain quyết state kế + tích luỹ event
 *                (KHÔNG side-effect, KHÔNG gọi SFTP/gRPC)
 *   3. PULL    : dist.pullDomainEvents() → lấy danh sách event vừa tích luỹ
 *   4. PERSIST : (trong 1 transaction) UPDATE state (+ optlock) + UPSERT channels
 *                + INSERT events + INSERT outbox → tất cả atomic
 *   5. RELAY   : outbox-relay (tiến trình khác, Step 6) đọc outbox → enqueue queue chuyên biệt
 *
 * Handler KHÔNG gọi WorkflowEnginePort trực tiếp — chỉ ghi outbox. Relay giữ tính at-least-once
 * (spec §Idempotency), giải quyết vấn đề 2-hệ-thống DB+Redis không chung transaction.
 *
 * Step 4: hỗ trợ 2 command (SUBMIT, MARK_VALIDATED). Step 5+ mở rộng thêm 8 command còn lại.
 *
 * Error handling:
 *   · AggregateNotFoundError → command non-SUBMIT mà load null → không retry được.
 *   · OptimisticLockError → 2 worker đua → BullMQ retry job → load lại version mới.
 *   · Bất kỳ throw khác trong callback uow.run → TypeOrmUnitOfWork rollback + rethrow.
 */
@Injectable()
export class OrchestrateHandler {
	constructor(
		@Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
		@Inject(DISTRIBUTION_REPOSITORY)
		private readonly repo: DistributionRepository,
		@Inject(POLICY_RESOLVER) private readonly policies: PolicyResolver,
		@Inject(CLOCK) private readonly clock: Clock,
	) {}

	async handle(command: DistributionCommand): Promise<void> {
		await this.uow.run(async (ctx) => {
			const dist = await this.loadOrCreate(ctx, command);
			this.applyCommand(dist, command);
			const events = dist.pullDomainEvents();
			const outbox = this.buildOutbox(dist, command);
			await this.repo.saveWithOutbox(ctx, dist, events, outbox);
		});
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
				this.applySubmit(dist, command);
				return;
			case 'MARK_VALIDATED':
				this.applyMarkValidated(dist, command);
				return;
		}
	}

	private applySubmit(dist: Distribution, _cmd: SubmitCommand): void {
		dist.submit(this.clock);
	}

	private applyMarkValidated(
		dist: Distribution,
		cmd: MarkValidatedCommand,
	): void {
		const policy = this.policies.resolve(dist.type);
		dist.markValidated(policy, cmd.requiresReview, this.clock);
	}

	// ─── OUTBOX derivation ────────────────────────────────────────────────

	/**
	 * Từ state MỚI của aggregate, quyết job kế cần enqueue.
	 *
	 * Step 4 chỉ handle 2 nhánh:
	 *   · VALIDATING          → không outbox (đợi external validator gọi MARK_VALIDATED)
	 *   · PROVISIONING_IDS    → 1 job vào `dist.provision-id`
	 *   · BUILDING_PACKAGE    → 1 job vào `dist.build-package`
	 *   · DELIVERING          → không outbox ở đây (channels enqueue riêng — Step 5)
	 *   · terminal states     → không outbox
	 *
	 * jobId = `${distId}:${state}:${key}` — deterministic, chống trùng ở tầng DB
	 * (UNIQUE(jobId) trên outbox_event) và ở BullMQ layer 1 (jobId dedupe).
	 */
	private buildOutbox(
		dist: Distribution,
		command: DistributionCommand,
	): OutboxEntry[] {
		const jobId = `${dist.id}:${dist.state}:${command.key}`;
		const payload = {
			distributionId: dist.id,
			correlationId: dist.correlationId,
			key: command.key,
		};

		switch (dist.state) {
			case DistributionState.PROVISIONING_IDS:
				return [{ queue: 'dist.provision-id', payload, jobId }];
			case DistributionState.BUILDING_PACKAGE:
				return [{ queue: 'dist.build-package', payload, jobId }];
			default:
				return [];
		}
	}
}
