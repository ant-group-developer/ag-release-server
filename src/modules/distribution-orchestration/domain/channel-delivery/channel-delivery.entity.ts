import { makeChannelEvent } from '../events/channel.events';
import { DomainEvent } from '../events/domain-event.base';
import { Clock } from '../ports/clock.port';
import { RetryPolicy } from '../value-objects/retry-policy.vo';
import { ChannelDeliverySpec } from './channel-delivery-spec';
import { advance } from './channel-interpreter';
import { ChannelInput, ChannelPosition } from './channel-interpreter.types';
import { ChannelState, isChannelTerminal } from './channel-state.enum';
import { DeliveryProcess } from './delivery-process';
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

	/** Rebuild from a persisted row (phase 2). */
	static rehydrate(
		spec: ChannelDeliverySpec,
		row: ChannelDeliveryRow,
		retry: RetryPolicy = RetryPolicy.sftpDefault(),
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
