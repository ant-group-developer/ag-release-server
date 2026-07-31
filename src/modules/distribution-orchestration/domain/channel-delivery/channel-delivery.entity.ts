import { makeChannelEvent } from '../events/channel.events';
import { DomainEvent } from '../events/domain-event.base';
import { Clock } from '../ports/clock.port';
import { RetryPolicy } from '../value-objects/retry-policy.vo';
import { ChannelDeliverySpec, ClusterMember } from './channel-delivery-spec';
import { advance } from './channel-interpreter';
import { ChannelInput, ChannelPosition } from './channel-interpreter.types';
import { ChannelState, isChannelTerminal } from './channel-state.enum';
import { DeliveryProcess, Stage, StageKind } from './delivery-process';
import { getProcess } from './delivery-process.registry';

/** Snapshot row to rehydrate a ChannelDelivery from persistence (phase 2 repo). */
export interface ChannelDeliveryRow {
	readonly channelId: string;
	readonly pos: number;
	readonly state: ChannelState;
	readonly retryCount: number;
	readonly ticketRef?: string;
}

/**
 * ChannelDelivery — the stateful shell around the pure interpreter.
 *
 * The interpreter is the brain (computes pos/state); this entity is the body: it holds state,
 * knows its channelId + Clock, and turns interpreter markers into full DomainEvents.
 * Testing the brain needs no body (done in channel-interpreter.spec).
 */
export class ChannelDelivery {
	private constructor(
		public readonly channelId: string,
		public readonly spec: ChannelDeliverySpec,
		private readonly process: DeliveryProcess,
		private readonly retry: RetryPolicy,
		private _pos: number,
		private _state: ChannelState,
		private _retryCount: number,
		private _ticketRef: string | undefined,
		// CI cluster: N DSP con chạy shared-stages chung. Rỗng = channel thường (direct/watcher).
		private readonly _members: readonly ClusterMember[] = [],
	) {}

	get pos(): number {
		return this._pos;
	}
	get state(): ChannelState {
		return this._state;
	}
	get retryCount(): number {
		return this._retryCount;
	}
	get ticketRef(): string | undefined {
		return this._ticketRef;
	}
	/** DSP con của 1 CI cluster (rỗng nếu là channel thường/direct/watcher). */
	get members(): readonly ClusterMember[] {
		return this._members;
	}
	/** True nếu channel này là CI cluster (gom N DSP chạy shared-stages). */
	get isCluster(): boolean {
		return this._members.length > 0;
	}
	/** True nếu là go-live watcher (spawn per-DSP sau cluster). id dạng `{clusterId}:golive:{dsp}`. */
	get isGoliveWatcher(): boolean {
		return this.channelId.includes(':golive:');
	}
	/** clusterId cha của 1 watcher (phần trước `:golive:`); undefined nếu không phải watcher. */
	get parentClusterId(): string | undefined {
		if (!this.isGoliveWatcher) return undefined;
		return this.channelId.split(':golive:')[0];
	}

	/** Spawn a fresh channel at stage 0 (PENDING) from its spec. */
	static create(
		channelId: string,
		spec: ChannelDeliverySpec,
		retry: RetryPolicy = RetryPolicy.sftpDefault(),
	): ChannelDelivery {
		const process = getProcess(spec.processCode);
		return new ChannelDelivery(
			channelId,
			spec,
			process,
			retry,
			0,
			ChannelState.PENDING,
			0,
			undefined,
		);
	}

	/**
	 * Spawn 1 CI cluster channel — gom N DSP con (members) chạy shared-stages (deliver/ingest/
	 * qa/export) 1 lần. spec.processCode = 'ci.cluster.initial'. members giữ dspCode+exportMethod
	 * để fan-out watcher + export distinct-method sau này.
	 */
	static createCluster(
		channelId: string,
		spec: ChannelDeliverySpec,
		members: readonly ClusterMember[],
		retry: RetryPolicy = RetryPolicy.sftpDefault(),
	): ChannelDelivery {
		if (members.length === 0) {
			throw new Error(
				'ChannelDelivery.createCluster: cluster needs ≥1 member',
			);
		}
		const process = getProcess(spec.processCode);
		return new ChannelDelivery(
			channelId,
			spec,
			process,
			retry,
			0,
			ChannelState.PENDING,
			0,
			undefined,
			members,
		);
	}

	/** Rebuild from a persisted row (phase 2). `members` khi rehydrate 1 CI cluster channel. */
	static rehydrate(
		spec: ChannelDeliverySpec,
		row: ChannelDeliveryRow,
		retry: RetryPolicy = RetryPolicy.sftpDefault(),
		members: readonly ClusterMember[] = [],
	): ChannelDelivery {
		const process = getProcess(spec.processCode);
		return new ChannelDelivery(
			row.channelId,
			spec,
			process,
			retry,
			row.pos,
			row.state,
			row.retryCount,
			row.ticketRef,
			members,
		);
	}

	/** True once the channel reached a terminal state (LIVE/ISSUES/TAKEN_DOWN/SKIPPED). */
	get isTerminal(): boolean {
		return isChannelTerminal(this._state);
	}

	/** Key of the first stage — the safe RESET target for a full retry (always pos 0 ≤ current). */
	get firstStageKey(): string {
		return this.process.stages[0].key;
	}

	/**
	 * Stage the channel now sits on — undefined when pos runs past the last stage (terminal
	 * LIVE/TAKEN_DOWN, no more work). Consumed by the outbox derivation in orchestrate.handler
	 * to pick which queue the channel's next job should ride.
	 */
	get currentStage(): Stage | undefined {
		return this.process.stages[this._pos];
	}

	/**
	 * willExhaustOnNextActionFail — read-only predicate mirroring the interpreter's INV-C2
	 * (channel-interpreter.ts ACTION_FAIL branch). Answers: "if the current ACTION stage fails
	 * ONE more time, does the channel go to ISSUES (true) or retry in place (false)?"
	 *
	 * Khối C: an ACTION runner (SFTP) opens a ticket + attaches ticketRef ONLY when this is true.
	 * On a non-exhausting fail it returns ACTION_FAIL WITHOUT a ticket — the interpreter counts the
	 * retry and re-drives the stage; opening a ticket there would orphan it (the interpreter drops
	 * ticketRef unless it actually enters ISSUES). Keeping the arithmetic here (not in the runner)
	 * keeps it in lock-step with the interpreter — one source of truth for exhaustion.
	 *
	 * Non-ACTION stages return false (GATE/WAIT fail their own way, straight to ISSUES).
	 */
	get willExhaustOnNextActionFail(): boolean {
		const stage = this.currentStage;
		if (!stage || stage.kind !== StageKind.ACTION) return false;
		const nextRetryCount = this._retryCount + 1;
		return !(stage.retryable && this.retry.canRetry(nextRetryCount));
	}

	/**
	 * Apply one input: run the interpreter, commit the new position, and turn the emitted
	 * markers into DomainEvents (stamped with channelId + clock time). Returns the events to accumulate.
	 */
	apply(
		input: ChannelInput,
		clock: Clock,
		distributionId: string,
	): DomainEvent[] {
		const current: ChannelPosition = {
			pos: this._pos,
			state: this._state,
			retryCount: this._retryCount,
		};
		const result = advance(this.process, current, input, this.retry);

		// commit new position
		this._pos = result.pos;
		this._state = result.state;
		this._retryCount = result.retryCount;
		if (result.ticketRef) {
			this._ticketRef = result.ticketRef;
		}

		// current-stage context for the timeline (stage the channel now sits on)
		const stage = this.process.stages[this._pos];
		const at = clock.now();
		return result.emitted.map((marker) =>
			makeChannelEvent(marker, distributionId, this.channelId, at, {
				stageKey: stage?.key,
				waitKind: stage?.waitKind,
				ticketRef: result.ticketRef,
			}),
		);
	}
}
