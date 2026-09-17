import { DistributionV2ChannelStatus } from '../../enums/distribution-v2.enum';
import {
	invalidTransition,
	invariantViolation,
} from '../errors/distribution-v2-domain.error';
import { RetryPolicyV2 } from '../value-objects/retry-policy';
import {
	ChannelDeliveryCommand,
	ChannelDeliveryReduction,
	ChannelDeliveryState,
} from './channel-delivery.types';

const TERMINAL_STATES = new Set<DistributionV2ChannelStatus>([
	DistributionV2ChannelStatus.LIVE,
	DistributionV2ChannelStatus.ISSUES,
	DistributionV2ChannelStatus.TAKEN_DOWN,
	DistributionV2ChannelStatus.SKIPPED,
]);

function ensureNotTerminal(state: ChannelDeliveryState, command: string): void {
	if (TERMINAL_STATES.has(state.status)) {
		throw invalidTransition('ChannelDelivery', state.status, command);
	}
}

function withCommon(
	state: ChannelDeliveryState,
	patch: Partial<ChannelDeliveryState>,
): ChannelDeliveryState {
	return {
		...state,
		...patch,
	};
}

function withCommand(
	state: ChannelDeliveryState,
	command: ChannelDeliveryCommand,
	patch: Partial<ChannelDeliveryState> = {},
): ChannelDeliveryState {
	return withCommon(state, {
		...patch,
		lastCommandId: command.commandId,
	});
}

function event(
	type: NonNullable<ChannelDeliveryReduction['event']>['type'],
	payload: Readonly<Record<string, unknown>>,
): ChannelDeliveryReduction['event'] {
	return { type, payload };
}

function assertCommandMetadata(command: ChannelDeliveryCommand): void {
	if (typeof command.commandId !== 'string' || !command.commandId.trim()) {
		throw invariantViolation('ChannelDelivery', 'commandId is required');
	}
	if (
		typeof command.occurredAt !== 'string' ||
		Number.isNaN(Date.parse(command.occurredAt))
	) {
		throw invariantViolation(
			'ChannelDelivery',
			'occurredAt must be a valid ISO date',
		);
	}
}

export function createChannelDeliveryState(input: {
	readonly id: string;
	readonly dspCode: string;
	readonly route: ChannelDeliveryState['route'];
	readonly aggregatorCode?: string | null;
	readonly previousLive?: boolean;
}): ChannelDeliveryState {
	if (!input.id.trim()) {
		throw invariantViolation('ChannelDelivery', 'id is required');
	}
	if (!input.dspCode.trim()) {
		throw invariantViolation('ChannelDelivery', 'dspCode is required');
	}

	return {
		id: input.id,
		dspCode: input.dspCode,
		route: input.route,
		aggregatorCode: input.aggregatorCode ?? null,
		status: DistributionV2ChannelStatus.PENDING,
		currentStage: null,
		retryCount: 0,
		waitReason: null,
		scheduledAt: null,
		lastError: null,
		externalRefs: {},
		previousLive: input.previousLive ?? false,
	};
}

export function reduceChannelDelivery(
	state: ChannelDeliveryState,
	command: ChannelDeliveryCommand,
	retryPolicy = new RetryPolicyV2(),
): ChannelDeliveryReduction {
	assertCommandMetadata(command);
	if (state.lastCommandId === command.commandId) {
		return { state };
	}

	switch (command.type) {
		case 'START_PROCESSING': {
			if (
				state.status !== DistributionV2ChannelStatus.PENDING &&
				state.status !== DistributionV2ChannelStatus.WAITING_EXTERNAL &&
				state.status !== DistributionV2ChannelStatus.WAITING_BATCH
			) {
				throw invalidTransition(
					'ChannelDelivery',
					state.status,
					command.type,
				);
			}
			const next = withCommand(state, command, {
				status: DistributionV2ChannelStatus.PROCESSING,
				currentStage: command.stage,
				waitReason: null,
				scheduledAt: null,
				lastError: null,
			});
			return {
				state: next,
				event: event('channel.processing_started', {
					stage: command.stage,
				}),
			};
		}

		case 'WAIT_EXTERNAL': {
			ensureNotTerminal(state, command.type);
			if (state.status !== DistributionV2ChannelStatus.PROCESSING) {
				throw invalidTransition(
					'ChannelDelivery',
					state.status,
					command.type,
				);
			}
			if (
				!command.scheduledAt ||
				Number.isNaN(Date.parse(command.scheduledAt))
			) {
				throw invariantViolation(
					'ChannelDelivery',
					'WAIT_EXTERNAL requires a valid scheduledAt',
				);
			}
			const next = withCommand(state, command, {
				status: DistributionV2ChannelStatus.WAITING_EXTERNAL,
				currentStage: command.stage ?? state.currentStage,
				waitReason: command.reason,
				scheduledAt: command.scheduledAt,
				externalRefs: {
					...(state.externalRefs ?? {}),
					...(command.externalRefs ?? {}),
				},
			});
			return {
				state: next,
				event: event('channel.waiting_external', {
					reason: command.reason,
					scheduledAt: command.scheduledAt,
					stage: next.currentStage,
					externalRefs: next.externalRefs,
				}),
			};
		}

		case 'WAIT_BATCH': {
			ensureNotTerminal(state, command.type);
			if (state.status !== DistributionV2ChannelStatus.PROCESSING) {
				throw invalidTransition(
					'ChannelDelivery',
					state.status,
					command.type,
				);
			}
			const next = withCommand(state, command, {
				status: DistributionV2ChannelStatus.WAITING_BATCH,
				currentStage: command.stage ?? state.currentStage,
				waitReason: null,
				scheduledAt: null,
			});
			return {
				state: next,
				event: event('channel.waiting_batch', {
					stage: next.currentStage,
				}),
			};
		}

		case 'MARK_LIVE': {
			ensureNotTerminal(state, command.type);
			if (
				state.status !== DistributionV2ChannelStatus.PROCESSING &&
				state.status !== DistributionV2ChannelStatus.WAITING_EXTERNAL &&
				state.status !== DistributionV2ChannelStatus.WAITING_BATCH
			) {
				throw invalidTransition(
					'ChannelDelivery',
					state.status,
					command.type,
				);
			}
			const next = withCommand(state, command, {
				status: DistributionV2ChannelStatus.LIVE,
				currentStage: command.stage ?? state.currentStage,
				waitReason: null,
				scheduledAt: null,
				lastError: null,
				externalRefs: {
					...(state.externalRefs ?? {}),
					...(command.externalRefs ?? {}),
				},
			});
			return {
				state: next,
				event: event('channel.live', {
					stage: next.currentStage,
					externalRefs: next.externalRefs,
				}),
			};
		}

		case 'OPEN_ISSUE': {
			ensureNotTerminal(state, command.type);
			if (!command.code.trim() || !command.message.trim()) {
				throw invariantViolation(
					'ChannelDelivery',
					'OPEN_ISSUE requires code and message',
				);
			}
			const next = withCommand(state, command, {
				status: DistributionV2ChannelStatus.ISSUES,
				currentStage: command.stage ?? state.currentStage,
				waitReason: null,
				scheduledAt: null,
				lastError: {
					code: command.code,
					message: command.message,
					...(command.details ?? {}),
				},
			});
			return {
				state: next,
				event: event('channel.issue_opened', {
					code: command.code,
					message: command.message,
					details: command.details ?? {},
				}),
			};
		}

		case 'MARK_TAKEN_DOWN': {
			ensureNotTerminal(state, command.type);
			if (
				state.status !== DistributionV2ChannelStatus.PROCESSING &&
				state.status !== DistributionV2ChannelStatus.WAITING_EXTERNAL
			) {
				throw invalidTransition(
					'ChannelDelivery',
					state.status,
					command.type,
				);
			}
			const next = withCommand(state, command, {
				status: DistributionV2ChannelStatus.TAKEN_DOWN,
				currentStage: command.stage ?? state.currentStage,
				waitReason: null,
				scheduledAt: null,
				lastError: null,
				externalRefs: {
					...(state.externalRefs ?? {}),
					...(command.externalRefs ?? {}),
				},
			});
			return {
				state: next,
				event: event('channel.taken_down', {
					stage: next.currentStage,
					externalRefs: next.externalRefs,
				}),
			};
		}

		case 'SKIP': {
			if (state.status !== DistributionV2ChannelStatus.PENDING) {
				throw invalidTransition(
					'ChannelDelivery',
					state.status,
					command.type,
				);
			}
			const next = withCommand(state, command, {
				status: DistributionV2ChannelStatus.SKIPPED,
				lastError: command.reason
					? { code: 'SKIPPED', message: command.reason }
					: null,
			});
			return {
				state: next,
				event: event('channel.skipped', {
					reason: command.reason ?? null,
				}),
			};
		}

		case 'RESET_FOR_RETRY': {
			if (state.status !== DistributionV2ChannelStatus.ISSUES) {
				throw invalidTransition(
					'ChannelDelivery',
					state.status,
					command.type,
				);
			}
			retryPolicy.assertCanRetry('ChannelDelivery', state.retryCount);
			const next = withCommand(state, command, {
				status: DistributionV2ChannelStatus.PENDING,
				currentStage: null,
				retryCount: state.retryCount + 1,
				waitReason: null,
				scheduledAt: null,
				lastError: null,
			});
			return {
				state: next,
				event: event('channel.retry_reset', {
					retryCount: next.retryCount,
				}),
			};
		}
	}
}
