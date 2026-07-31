import { ChannelDeliverySpec } from '../channel-delivery/channel-delivery-spec';
import { ChannelDelivery } from '../channel-delivery/channel-delivery.entity';
import { ChannelInputType } from '../channel-delivery/channel-interpreter.types';
import { ChannelState } from '../channel-delivery/channel-state.enum';
import { ChannelTopology } from '../channel-delivery/channel-topology.enum';
import { planChannelSpawn } from '../channel-delivery/plan-channel-spawn';
import {
	InvalidTransitionError,
	InvariantViolationError,
	RetryLimitExceededError,
} from '../errors/domain-errors';
import * as E from '../events/distribution.events';
import { DomainEvent } from '../events/domain-event.base';
import { ExecutionPolicy } from '../policies/execution-policy.port';
import { buildGoliveProcessCode } from '../policies/process-code.helper';
import { Clock } from '../ports/clock.port';
import { ExecutionTypeEnum } from '../value-objects/execution-type.enum';
import { DistributionState } from './distribution-state.enum';
import {
	CreateDistributionProps,
	DistributionSnapshotRow,
	RetryScope,
	resolveDistributionOutcome,
} from './distribution.types';

const POISON_LIMIT = 3; // max retries before RetryLimitExceededError (spec: poison = 3)

/**
 * Distribution — the aggregate root. A milestone-level state machine (see DistributionState).
 * Every transition: guard → change state → push event; idempotent (re-calling at the target = no-op).
 * The aggregate accumulates events (pullDomainEvents) — it never publishes directly (outbox link).
 */
export class Distribution {
	private _state: DistributionState = DistributionState.DRAFT;
	private _channels: ChannelDelivery[] = [];
	private _upc?: string;
	/** Map groupKey (dspRoute) → package path. 1 package/nhóm phân phối. */
	private _packageUris: Record<string, string> = {};
	private _retryCount = 0;
	private _version = 0; // optimistic lock — repo checks (WHERE version=?) then version+1
	private readonly _pending: DomainEvent[] = [];

	private constructor(
		public readonly id: string,
		public readonly releaseId: string,
		public readonly snapshotId: string,
		public readonly tenantId: string,
		public readonly type: ExecutionTypeEnum,
		public readonly correlationId: string,
		private readonly _channelSpecs: readonly ChannelDeliverySpec[],
	) {}

	get state(): DistributionState {
		return this._state;
	}
	get channels(): readonly ChannelDelivery[] {
		return this._channels;
	}
	get retryCount(): number {
		return this._retryCount;
	}
	/**
	 * True khi đã cạn hạn retry (poison). Mirror guard trong resetForRetry (INV-D8) — cho
	 * application (Khối E) pre-validate → trả HTTP 409 TRƯỚC khi enqueue, thay vì để worker
	 * throw RetryLimitExceededError chìm trong job.
	 */
	get retriesExhausted(): boolean {
		return this._retryCount >= POISON_LIMIT;
	}
	/** Channel đang ISSUES (điểm hỏng) — application đọc để resolve ticket khi RESET (Khối E). */
	get issuesChannelIds(): string[] {
		return this._channels
			.filter((c) => c.state === 'ISSUES')
			.map((c) => c.channelId);
	}
	get version(): number {
		return this._version;
	}
	get upc(): string | undefined {
		return this._upc;
	}
	/** Toàn bộ map groupKey → package path (đọc-only). Rỗng khi chưa build. */
	get packageUris(): Readonly<Record<string, string>> {
		return this._packageUris;
	}
	/** Đã build ít nhất 1 nhóm chưa (dùng cho idempotency guard ở runner). */
	get hasBuiltPackages(): boolean {
		return Object.keys(this._packageUris).length > 0;
	}
	/** Package path của 1 nhóm phân phối (undefined nếu nhóm chưa build). */
	packageUriFor(groupKey: string): string | undefined {
		return this._packageUris[groupKey];
	}
	get channelSpecs(): readonly ChannelDeliverySpec[] {
		return this._channelSpecs;
	}

	/** Create a fresh aggregate in DRAFT (submit is a separate transition). */
	static create(props: CreateDistributionProps): Distribution {
		return new Distribution(
			props.id,
			props.releaseId,
			props.snapshotId,
			props.tenantId,
			props.type,
			props.correlationId,
			props.channelSpecs,
		);
	}

	// ── DRAFT → VALIDATING ──
	submit(clock: Clock): void {
		if (this._state === DistributionState.VALIDATING) return; // idempotent
		if (this._state !== DistributionState.DRAFT) {
			throw new InvalidTransitionError(this._state, 'submit');
		}
		if (this._channelSpecs.length === 0) {
			throw new InvariantViolationError(
				'Distribution',
				'submit needs ≥1 channel',
			);
		}
		if (!this.snapshotId) {
			throw new InvariantViolationError(
				'Distribution',
				'submit needs snapshotId',
			);
		}
		this._state = DistributionState.VALIDATING;
		this._pending.push(
			E.makeDistributionSubmitted(this.id, clock.now(), {
				channelCount: this._channelSpecs.length,
				snapshotId: this.snapshotId,
			}),
		);
	}

	// ── VALIDATING → IN_REVIEW | PROVISIONING_IDS | DELIVERING ──
	markValidated(
		policy: ExecutionPolicy,
		requiresReview: boolean,
		clock: Clock,
	): void {
		if (this._state !== DistributionState.VALIDATING) {
			throw new InvalidTransitionError(this._state, 'markValidated');
		}
		const next = requiresReview
			? DistributionState.IN_REVIEW
			: this.stateAfterReview(policy);
		this._state = next;
		this._pending.push(E.makeValidated(this.id, clock.now(), { next }));
		if (next === DistributionState.DELIVERING)
			this.ensureChannelsSpawned(policy);
	}

	// ── VALIDATING → ACTION_REQUIRED (never DRAFT — INV-D3) ──
	flagValidationErrors(
		ticketRef: string,
		errors: string[],
		clock: Clock,
	): void {
		if (this._state !== DistributionState.VALIDATING) {
			throw new InvalidTransitionError(
				this._state,
				'flagValidationErrors',
			);
		}
		this._state = DistributionState.ACTION_REQUIRED;
		this._pending.push(
			E.makeValidationErrorsFlagged(this.id, clock.now(), {
				ticketRef,
				errors,
			}),
		);
	}
	// ── IN_REVIEW → PROVISIONING_IDS | DELIVERING ──
	approveReview(
		reviewerId: string,
		policy: ExecutionPolicy,
		clock: Clock,
	): void {
		if (this._state !== DistributionState.IN_REVIEW) {
			throw new InvalidTransitionError(this._state, 'approveReview');
		}
		const next = this.stateAfterReview(policy);
		this._state = next;
		this._pending.push(
			E.makeReviewApproved(this.id, clock.now(), { reviewerId, next }),
		);
		if (next === DistributionState.DELIVERING)
			this.ensureChannelsSpawned(policy);
	}

	// ── IN_REVIEW → ACTION_REQUIRED ──
	rejectReview(
		reviewerId: string,
		ticketRef: string,
		note: string,
		clock: Clock,
	): void {
		if (this._state !== DistributionState.IN_REVIEW) {
			throw new InvalidTransitionError(this._state, 'rejectReview');
		}
		this._state = DistributionState.ACTION_REQUIRED;
		this._pending.push(
			E.makeReviewRejected(this.id, clock.now(), {
				reviewerId,
				ticketRef,
				note,
			}),
		);
	}

	// ── ACTION_REQUIRED → VALIDATING (user/reviewer fixed it) ──
	resubmit(clock: Clock): void {
		if (this._state === DistributionState.VALIDATING) return; // idempotent
		if (this._state !== DistributionState.ACTION_REQUIRED) {
			throw new InvalidTransitionError(this._state, 'resubmit');
		}
		this._state = DistributionState.VALIDATING;
		this._pending.push(E.makeResubmitted(this.id, clock.now()));
	}

	// ── PROVISIONING_IDS → BUILDING_PACKAGE (UPDATE passes through: upc undefined = no-op) ──
	markIdsProvisioned(upc: string | undefined, clock: Clock): void {
		if (this._state === DistributionState.BUILDING_PACKAGE) return; // idempotent
		if (this._state !== DistributionState.PROVISIONING_IDS) {
			throw new InvalidTransitionError(this._state, 'markIdsProvisioned');
		}
		if (upc) this._upc = upc;
		this._state = DistributionState.BUILDING_PACKAGE;
		this._pending.push(
			E.makeIdsProvisioned(this.id, clock.now(), { upc: this._upc }),
		);
	}

	// ── BUILDING_PACKAGE → DELIVERING ──
	markPackageBuilt(
		packageUris: Record<string, string>,
		policy: ExecutionPolicy,
		clock: Clock,
	): void {
		if (this._state === DistributionState.DELIVERING) return; // idempotent
		if (this._state !== DistributionState.BUILDING_PACKAGE) {
			throw new InvalidTransitionError(this._state, 'markPackageBuilt');
		}
		if (!packageUris || Object.keys(packageUris).length === 0) {
			throw new InvariantViolationError(
				'Distribution',
				'markPackageBuilt needs ≥1 package path',
			);
		}
		this._packageUris = { ...packageUris };
		this._state = DistributionState.DELIVERING;
		this._pending.push(
			E.makePackageBuilt(this.id, clock.now(), { packageUris }),
		);
		this.ensureChannelsSpawned(policy);
	}
	// ── channel input → run interpreter via entity, collect its events, then re-resolve ──
	applyChannelInput(
		channelId: string,
		input: Parameters<ChannelDelivery['apply']>[0],
		clock: Clock,
	): void {
		if (this._state !== DistributionState.DELIVERING) {
			throw new InvalidTransitionError(this._state, 'applyChannelInput');
		}
		const channel = this._channels.find((c) => c.channelId === channelId);
		if (!channel) {
			throw new InvariantViolationError(
				'Distribution',
				`unknown channel: ${channelId}`,
			);
		}
		const events = channel.apply(input, clock, this.id);
		this._pending.push(...events);
		// Cluster CI vừa xong shared-stages (→ SKIPPED) → fan-out watcher go-live per-DSP TRƯỚC khi
		// bubble-up. Nếu không, cluster SKIPPED đứng 1 mình bị resolve thành FAILED (0 LIVE, all terminal).
		this.fanOutWatchers(clock);
		this.syncChannelOutcome(clock);
	}

	// ── DELIVERING → DISTRIBUTED | PARTIALLY_DISTRIBUTED | FAILED | TAKEN_DOWN (bubble-up) ──
	syncChannelOutcome(clock: Clock): void {
		if (this._state !== DistributionState.DELIVERING) return;
		const outcome = resolveDistributionOutcome(
			this._channels.map((c) => c.state),
		);
		if (!outcome) return; // still waiting on a channel

		this._state = outcome;
		const at = clock.now();
		if (outcome === DistributionState.DISTRIBUTED) {
			this._pending.push(E.makeDistributed(this.id, at));
		} else if (outcome === DistributionState.PARTIALLY_DISTRIBUTED) {
			const live = this._channels.filter(
				(c) => c.state === 'LIVE',
			).length;
			const issues = this._channels.filter(
				(c) => c.state === 'ISSUES',
			).length;
			this._pending.push(
				E.makePartiallyDistributed(this.id, at, {
					liveCount: live,
					issuesCount: issues,
				}),
			);
		} else if (outcome === DistributionState.FAILED) {
			this._pending.push(E.makeDistributionFailed(this.id, at));
		} else if (outcome === DistributionState.TAKEN_DOWN) {
			this._pending.push(E.makeTakenDown(this.id, at));
		}
	}

	// ── PARTIALLY_DISTRIBUTED | FAILED → DELIVERING (retry) ──
	resetForRetry(
		scope: RetryScope,
		policy: ExecutionPolicy,
		clock: Clock,
	): void {
		if (
			this._state !== DistributionState.PARTIALLY_DISTRIBUTED &&
			this._state !== DistributionState.FAILED
		) {
			throw new InvalidTransitionError(this._state, 'resetForRetry');
		}
		if (!policy.canRetry()) {
			throw new InvariantViolationError(
				'Distribution',
				'policy does not allow retry',
			);
		}
		if (this._retryCount >= POISON_LIMIT) {
			throw new RetryLimitExceededError(
				'Distribution',
				this._retryCount,
				POISON_LIMIT,
			);
		}
		this._retryCount += 1;
		this._state = DistributionState.DELIVERING;

		// reset only ISSUES channels (never touch LIVE — spec: LIVE stays as-is)
		const targets =
			scope.channelIds ??
			this._channels
				.filter((c) => c.state === 'ISSUES')
				.map((c) => c.channelId);

		// Nếu 1 go-live watcher ISSUES → reset CẢ CLUSTER cha (quyết định: re-upload + re-QA cả cụm).
		// Gom cluster cha cần reset TRƯỚC, để xoá watcher + revive cluster (không reset lẻ watcher).
		const clustersToReset = new Set<string>();
		for (const c of this._channels) {
			if (
				c.state === 'ISSUES' &&
				targets.includes(c.channelId) &&
				c.isGoliveWatcher &&
				c.parentClusterId
			) {
				clustersToReset.add(c.parentClusterId);
			}
		}

		for (const channel of this._channels) {
			if (
				channel.state !== 'ISSUES' ||
				!targets.includes(channel.channelId)
			)
				continue;
			// Watcher ISSUES đã cuộn vào reset cluster cha → bỏ qua ở đây (không RESET lẻ).
			if (channel.isGoliveWatcher) continue;
			const events = channel.apply(
				{
					type: ChannelInputType.RESET,
					resetToKey: channel.firstStageKey,
				},
				clock,
				this.id,
			);
			this._pending.push(...events);
		}

		// Reset cả cluster: xoá watcher (mọi state, kể cả LIVE — làm lại từ deliver) + RESET cluster
		// từ SKIPPED về stage đầu (deliver). fanOutWatchers sẽ spawn lại watcher khi cluster xong.
		if (clustersToReset.size > 0) {
			this._channels = this._channels.filter(
				(c) =>
					!(
						c.isGoliveWatcher &&
						c.parentClusterId &&
						clustersToReset.has(c.parentClusterId)
					),
			);
			for (const cluster of this._channels) {
				if (!clustersToReset.has(cluster.channelId)) continue;
				const events = cluster.apply(
					{
						type: ChannelInputType.RESET,
						resetToKey: cluster.firstStageKey,
					},
					clock,
					this.id,
				);
				this._pending.push(...events);
			}
		}

		this._pending.push(
			E.makeRetryReset(this.id, clock.now(), {
				scope: JSON.stringify(scope),
			}),
		);
	}

	// ── DISTRIBUTED | PARTIALLY_DISTRIBUTED → TAKEN_DOWN (explicit, INV-D7) ──
	markTakenDown(policy: ExecutionPolicy, clock: Clock): void {
		if (this._state === DistributionState.TAKEN_DOWN) return; // idempotent
		if (policy.terminalIntent() !== 'TAKEN_DOWN') {
			throw new InvariantViolationError(
				'Distribution',
				'policy is not TAKEDOWN',
			);
		}
		const allDown = this._channels.every(
			(c) => c.state === 'TAKEN_DOWN' || c.state === 'SKIPPED',
		);
		if (!allDown) {
			throw new InvariantViolationError(
				'Distribution',
				'not all channels are TAKEN_DOWN/SKIPPED',
			);
		}
		this._state = DistributionState.TAKEN_DOWN;
		this._pending.push(E.makeTakenDown(this.id, clock.now()));
	}

	// ── outbox hook: return + clear accumulated events ──
	pullDomainEvents(): DomainEvent[] {
		return this._pending.splice(0, this._pending.length);
	}

	// ── rehydrate from persistence (phase 2 repo) ──
	static rehydrate(
		row: DistributionSnapshotRow,
		channels: ChannelDelivery[],
	): Distribution {
		const d = new Distribution(
			row.id,
			row.releaseId,
			row.snapshotId,
			row.tenantId,
			row.type,
			row.correlationId,
			row.channelSpecs,
		);
		d._state = row.state;
		d._channels = channels;
		d._upc = row.upc;
		d._packageUris = row.packageUris ?? {};
		d._retryCount = row.retryCount;
		d._version = row.version;
		return d;
	}

	// ── private helpers ──

	/** After VALIDATING/review passes: branch by policy (INV-D1, INV-D2). */
	private stateAfterReview(policy: ExecutionPolicy): DistributionState {
		// TAKEDOWN skips provision + build → straight to DELIVERING (takedown process).
		// INITIAL/UPDATE go through PROVISIONING_IDS (UPDATE no-ops inside) for one machine shape.
		return policy.needsBuildAndUpload()
			? DistributionState.PROVISIONING_IDS
			: DistributionState.DELIVERING;
	}

	/**
	 * Spawn ChannelDelivery entities once, on entering DELIVERING.
	 * DIRECT → 1 channel/DSP. AGGREGATOR (initial) → 1 CLUSTER channel/aggregator (gom N DSP con
	 * chạy shared-stages 1 lần). Watcher go-live spawn SAU (fanOutWatchers khi cluster → SKIPPED).
	 */
	private ensureChannelsSpawned(policy: ExecutionPolicy): void {
		if (this._channels.length > 0) return; // idempotent
		const plans = planChannelSpawn(this._channelSpecs, policy);
		this._channels = plans.map((plan, i) => {
			const channelId = `${this.id}:ch:${i}`;
			return plan.kind === 'cluster'
				? ChannelDelivery.createCluster(
						channelId,
						plan.clusterSpec,
						plan.members,
					)
				: ChannelDelivery.create(channelId, plan.spec);
		});
	}

	/**
	 * Fan-out: khi 1 CI cluster channel chạy hết shared-stages (→ SKIPPED), spawn N go-live
	 * watcher (mỗi member DSP 1 channel `ci.golive`). Mỗi watcher poll go-live độc lập → LIVE/ISSUES.
	 *
	 * Idempotent: chỉ spawn watcher cho cluster CHƯA có watcher (chống double-spawn khi job redeliver).
	 * Watcher id = `{clusterId}:golive:{dspCode}` — deterministic, dò được cluster cha.
	 */
	private fanOutWatchers(clock: Clock): void {
		const newWatchers: ChannelDelivery[] = [];
		for (const cluster of this._channels) {
			if (!cluster.isCluster) continue;
			if (cluster.state !== ChannelState.SKIPPED) continue; // chưa xong shared-stages
			for (const member of cluster.members) {
				const watcherId = `${cluster.channelId}:golive:${member.dspCode}`;
				if (this._channels.some((c) => c.channelId === watcherId)) {
					continue; // đã fan-out — idempotent
				}
				const watcher = ChannelDelivery.create(watcherId, {
					dspCode: member.dspCode,
					topology: ChannelTopology.VIA_AGGREGATOR,
					processCode: buildGoliveProcessCode(),
					aggregatorCode: cluster.spec.aggregatorCode,
					exportMethod: member.exportMethod,
					hasDeal: member.hasDeal,
				});
				newWatchers.push(watcher);
				this._pending.push(
					E.makeWatcherSpawned(this.id, clock.now(), {
						clusterChannelId: cluster.channelId,
						watcherChannelId: watcherId,
						dspCode: member.dspCode,
					}),
				);
			}
		}
		this._channels = [...this._channels, ...newWatchers];
	}
}
