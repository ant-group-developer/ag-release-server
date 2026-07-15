import {
	InvalidTransitionError,
	InvariantViolationError,
} from '../errors/domain-errors';
import { RetryPolicy } from '../value-objects/retry-policy.vo';
import {
	AdvanceResult,
	ChannelEventType,
	ChannelInput,
	ChannelInputType,
	ChannelPosition,
} from './channel-interpreter.types';
import { ChannelState, isChannelTerminal } from './channel-state.enum';
import { DeliveryProcess, StageKind } from './delivery-process';

/**
 * deriveState — the channel's state is a pure function of WHERE the marker now sits (INV-C5).
 * State is never set by hand; it is always read off the current stage's kind.
 *   past the last stage → the process's declared terminalState (LIVE by default,
 *                         TAKEN_DOWN for a takedown process — process-as-data, not hardcoded)
 *   WAIT stage         → WAITING
 *   ACTION | GATE stage → DELIVERING (we are actively doing/checking something)
 */
export function deriveState(
	process: DeliveryProcess,
	pos: number,
): ChannelState {
	if (pos >= process.stages.length) {
		return process.terminalState ?? ChannelState.LIVE;
	}

	const kind = process.stages[pos].kind;
	if (kind === StageKind.WAIT) {
		return ChannelState.WAITING;
	}

	return ChannelState.DELIVERING;
}

/**
 * advance — the pure reducer: (process, current, input, retry) → next.
 * No side effects, no id/time/ports. Returns a fresh AdvanceResult (never mutates `current`).
 * Emits ChannelEventType markers only; the entity (Step 8) turns them into full DomainEvents.
 */
export function advance(
	process: DeliveryProcess,
	current: ChannelPosition,
	input: ChannelInput,
	retry: RetryPolicy,
): AdvanceResult {
	// Idempotency: once terminal, repeated inputs are no-ops (no duplicate events).
	// RESET is the one exception — it is only ever issued from a terminal ISSUES state to retry.
	if (
		isChannelTerminal(current.state) &&
		input.type !== ChannelInputType.RESET
	) {
		return { ...current, emitted: [] };
	}

	const stage = process.stages[current.pos];

	switch (input.type) {
		// ── ACTION completed: advance one stage ──
		case ChannelInputType.STEP_DONE: {
			// INV-C1: STEP_DONE is only valid on an ACTION stage; anything else is a jump.
			if (stage.kind !== StageKind.ACTION) {
				throw new InvalidTransitionError(
					current.state,
					ChannelInputType.STEP_DONE,
				);
			}

			const nextPos = current.pos + 1;
			const nextState = deriveState(process, nextPos);
			// Every forward move emits a "done" event, plus one extra based on the landing stage:
			//   landed on the end → ChannelLive · landed on a WAIT → Waiting · else nothing.
			const emitted: ChannelEventType[] = [
				ChannelEventType.STAGE_COMPLETED,
			];

			appendLandingEvent(emitted, nextState);

			return { pos: nextPos, emitted, state: nextState, retryCount: 0 };
		}

		// ── WAIT resolved (woken up): advance one stage ──
		case ChannelInputType.ARRIVED: {
			// INV-C1: ARRIVED only wakes a WAIT stage.
			if (stage.kind !== StageKind.WAIT) {
				throw new InvalidTransitionError(
					current.state,
					ChannelInputType.ARRIVED,
				);
			}

			const nextPos = current.pos + 1;
			const nextState = deriveState(process, nextPos);
			// Same tail as STEP_DONE, but the "done" event is WaitResolved (a wait finished, not an action).
			const emitted: ChannelEventType[] = [
				ChannelEventType.WAIT_RESOLVED,
			];

			appendLandingEvent(emitted, nextState);

			return { pos: nextPos, emitted, state: nextState, retryCount: 0 };
		}

		// ── GATE passed: advance one stage ──
		case ChannelInputType.GATE_PASS: {
			// INV-C3: a GATE must be passed to move on; only a GATE stage accepts GATE_PASS.
			if (stage.kind !== StageKind.GATE) {
				throw new InvalidTransitionError(
					current.state,
					ChannelInputType.GATE_PASS,
				);
			}

			const nextPos = current.pos + 1;
			const nextState = deriveState(process, nextPos);
			const emitted: ChannelEventType[] = [
				ChannelEventType.STAGE_COMPLETED,
			];

			appendLandingEvent(emitted, nextState);

			return { pos: nextPos, emitted, state: nextState, retryCount: 0 };
		}

		// ── GATE failed (QA flagged): stay put, go to ISSUES ──
		case ChannelInputType.GATE_FAIL: {
			// INV-C3: only a GATE can GATE_FAIL. No detour around the gate.
			if (stage.kind !== StageKind.GATE) {
				throw new InvalidTransitionError(
					current.state,
					ChannelInputType.GATE_FAIL,
				);
			}

			// INV-C6: every path into ISSUES must carry a ticketRef (no silent failures).
			const ticketRef = requireTicketRef(
				input,
				ChannelInputType.GATE_FAIL,
			);

			// pos stays: the channel stalls on the failed stage until a RESET retries it.
			const nextPos = current.pos;
			const nextState = ChannelState.ISSUES;
			const emitted: ChannelEventType[] = [
				ChannelEventType.CHANNEL_ISSUES,
			];

			return {
				pos: nextPos,
				emitted,
				state: nextState,
				retryCount: 0,
				ticketRef,
			};
		}

		// ── WAIT failed externally (e.g. DSP reject / export error): stay put, go to ISSUES ──
		case ChannelInputType.WAIT_FAIL: {
			// INV-C1: WAIT_FAIL only applies while on a WAIT stage.
			if (stage.kind !== StageKind.WAIT) {
				throw new InvalidTransitionError(
					current.state,
					ChannelInputType.WAIT_FAIL,
				);
			}

			// INV-C6: same as GATE_FAIL — ISSUES needs a ticket.
			const ticketRef = requireTicketRef(
				input,
				ChannelInputType.WAIT_FAIL,
			);

			const nextPos = current.pos;
			const nextState = ChannelState.ISSUES;
			const emitted: ChannelEventType[] = [
				ChannelEventType.CHANNEL_ISSUES,
			];

			return {
				pos: nextPos,
				emitted,
				state: nextState,
				retryCount: 0,
				ticketRef,
			};
		}

		// ── ACTION attempt failed: retry in place, or exhaust to ISSUES ──
		case ChannelInputType.ACTION_FAIL: {
			// INV-C1: only an ACTION stage can ACTION_FAIL.
			if (stage.kind !== StageKind.ACTION) {
				throw new InvalidTransitionError(
					current.state,
					ChannelInputType.ACTION_FAIL,
				);
			}

			// count this failure; canRetry() checks the new count against maxAttempts.
			const nextRetryCount = current.retryCount + 1;

			// INV-C2: retry only while the stage is retryable AND under the limit.
			if (
				process.stages[current.pos].retryable &&
				retry.canRetry(nextRetryCount)
			) {
				// stay in place, still DELIVERING; a progress-level ActionRetried event (no state change).
				const nextPos = current.pos;
				const nextState = deriveState(process, nextPos);
				const emitted: ChannelEventType[] = [
					ChannelEventType.ACTION_RETRIED,
				];

				return {
					pos: nextPos,
					emitted,
					state: nextState,
					retryCount: nextRetryCount,
				};
			} else {
				// exhausted or non-retryable → ISSUES (INV-C2), with a ticket (INV-C6).
				const ticketRef = requireTicketRef(
					input,
					ChannelInputType.ACTION_FAIL,
				);

				const nextPos = current.pos;
				const nextState = ChannelState.ISSUES;
				const emitted: ChannelEventType[] = [
					ChannelEventType.CHANNEL_ISSUES,
				];

				return {
					pos: nextPos,
					emitted,
					state: nextState,
					retryCount: nextRetryCount,
					ticketRef,
				};
			}
		}

		// ── RETRY: rewind to an earlier valid stage and resume ──
		case ChannelInputType.RESET: {
			if (!input.resetToKey) {
				throw new InvariantViolationError(
					'ChannelInterpreter',
					'RESET requires resetToKey',
				);
			}

			if (current.state !== ChannelState.ISSUES) {
				throw new InvalidTransitionError(
					current.state,
					ChannelInputType.RESET,
				);
			}

			const targetPos = process.stages.findIndex(
				(s) => s.key === input.resetToKey,
			);
			// INV-C7: the target must exist and be at or before the current stage
			// (no resetting forward into the future).
			if (targetPos === -1 || targetPos > current.pos) {
				throw new InvariantViolationError(
					'ChannelInterpreter',
					`invalid resetToKey: ${input.resetToKey}`,
				);
			}

			// resume from the target stage; retry counter cleared for a fresh run.
			const nextState = deriveState(process, targetPos);
			const emitted: ChannelEventType[] = [
				ChannelEventType.CHANNEL_RESET,
			];

			return {
				pos: targetPos,
				state: nextState,
				emitted,
				retryCount: 0,
			};
		}

		// Unknown input type → reject (also satisfies "return on every path").
		default:
			throw new InvalidTransitionError(current.state, input.type);
	}
}

/**
 * requireTicketRef — enforces INV-C6: any transition into ISSUES must carry a ticketRef.
 * The application opens the ticket via TicketService, then passes the ref in the input.
 */
function requireTicketRef(input: ChannelInput, context: string): string {
	if (!input.ticketRef) {
		throw new InvariantViolationError(
			'ChannelInterpreter',
			`${context} requires ticketRef`,
		);
	}

	return input.ticketRef;
}

function appendLandingEvent(
	emitted: ChannelEventType[],
	nextState: ChannelState,
): void {
	if (nextState === ChannelState.LIVE) {
		emitted.push(ChannelEventType.CHANNEL_LIVE);
	} else if (nextState === ChannelState.TAKEN_DOWN) {
		emitted.push(ChannelEventType.CHANNEL_TAKEN_DOWN);
	} else if (nextState === ChannelState.WAITING) {
		emitted.push(ChannelEventType.WAITING);
	}
}
