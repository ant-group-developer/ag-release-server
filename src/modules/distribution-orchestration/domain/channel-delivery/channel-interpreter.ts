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

export function deriveState(
	process: DeliveryProcess,
	pos: number,
): ChannelState {
	if (pos >= process.stages.length) {
		return ChannelState.LIVE;
	}

	const kind = process.stages[pos].kind;
	if (kind === StageKind.WAIT) {
		return ChannelState.WAITING;
	}

	return ChannelState.DELIVERING;
}

export function advance(
	process: DeliveryProcess,
	current: ChannelPosition,
	input: ChannelInput,
	retry: RetryPolicy,
): AdvanceResult {
	if (
		isChannelTerminal(current.state) &&
		input.type !== ChannelInputType.RESET
	) {
		return { ...current, emitted: [] };
	}

	const stage = process.stages[current.pos];

	switch (input.type) {
		case ChannelInputType.STEP_DONE: {
			if (stage.kind !== StageKind.ACTION) {
				throw new InvalidTransitionError(
					current.state,
					ChannelInputType.STEP_DONE,
				);
			}

			const nextPos = current.pos + 1;
			const nextState = deriveState(process, nextPos);
			const emitted: ChannelEventType[] = [
				ChannelEventType.STAGE_COMPLETED,
			];

			if (nextState === ChannelState.LIVE) {
				emitted.push(ChannelEventType.CHANNEL_LIVE);
			} else if (nextState === ChannelState.WAITING) {
				emitted.push(ChannelEventType.WAITING);
			}

			return { pos: nextPos, emitted, state: nextState, retryCount: 0 };
		}

		case ChannelInputType.ARRIVED: {
			if (stage.kind !== StageKind.WAIT) {
				throw new InvalidTransitionError(
					current.state,
					ChannelInputType.ARRIVED,
				);
			}

			const nextPos = current.pos + 1;
			const nextState = deriveState(process, nextPos);
			const emitted: ChannelEventType[] = [
				ChannelEventType.WAIT_RESOLVED,
			];

			if (nextState === ChannelState.LIVE) {
				emitted.push(ChannelEventType.CHANNEL_LIVE);
			} else if (nextState === ChannelState.WAITING) {
				emitted.push(ChannelEventType.WAITING);
			}

			return { pos: nextPos, emitted, state: nextState, retryCount: 0 };
		}

		case ChannelInputType.GATE_PASS: {
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

			if (nextState === ChannelState.LIVE) {
				emitted.push(ChannelEventType.CHANNEL_LIVE);
			} else if (nextState === ChannelState.WAITING) {
				emitted.push(ChannelEventType.WAITING);
			}

			return { pos: nextPos, emitted, state: nextState, retryCount: 0 };
		}

		case ChannelInputType.GATE_FAIL: {
			if (stage.kind !== StageKind.GATE) {
				throw new InvalidTransitionError(
					current.state,
					ChannelInputType.GATE_FAIL,
				);
			}

			const ticketRef = requireTicketRef(
				input,
				ChannelInputType.GATE_FAIL,
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

		case ChannelInputType.WAIT_FAIL: {
			if (stage.kind !== StageKind.WAIT) {
				throw new InvalidTransitionError(
					current.state,
					ChannelInputType.WAIT_FAIL,
				);
			}

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

		case ChannelInputType.ACTION_FAIL: {
			if (stage.kind !== StageKind.ACTION) {
				throw new InvalidTransitionError(
					current.state,
					ChannelInputType.ACTION_FAIL,
				);
			}

			const nextRetryCount = current.retryCount + 1;

			if (
				process.stages[current.pos].retryable &&
				retry.canRetry(nextRetryCount)
			) {
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

		case ChannelInputType.RESET: {
			if (!input.resetToKey) {
				throw new InvariantViolationError(
					'ChannelInterpreter',
					'RESET requires resetToKey',
				);
			}

			const targetPos = process.stages.findIndex(
				(s) => s.key === input.resetToKey,
			);
			if (targetPos === -1 || targetPos > current.pos) {
				throw new InvariantViolationError(
					'ChannelInterpreter',
					`invalid resetToKey: ${input.resetToKey}`,
				);
			}

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

		default:
			throw new InvalidTransitionError(current.state, input.type);
	}
}

function requireTicketRef(input: ChannelInput, context: string): string {
	if (!input.ticketRef) {
		throw new InvariantViolationError(
			'ChannelInterpreter',
			`${context} requires ticketRef`,
		);
	}

	return input.ticketRef;
}
