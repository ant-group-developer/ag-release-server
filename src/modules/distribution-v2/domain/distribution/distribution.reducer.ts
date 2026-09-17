import {
	DistributionV2ChannelStatus,
	DistributionV2ExecutionType,
	DistributionV2Status,
} from '../../enums/distribution-v2.enum';
import {
	createChannelDeliveryState,
	reduceChannelDelivery,
} from '../channel/channel-delivery.reducer';
import { ChannelDeliveryCommand } from '../channel/channel-delivery.types';
import {
	invalidTransition,
	invariantViolation,
} from '../errors/distribution-v2-domain.error';
import { DistributionV2DomainEvent } from '../events/distribution-v2.domain-event';
import { RetryPolicyV2 } from '../value-objects/retry-policy';
import { policyFor } from './distribution-policy';
import {
	CHANNEL_TERMINAL_STATES,
	DistributionCommand,
	DistributionReduction,
	DistributionState,
} from './distribution.types';

function event(
	type: DistributionV2DomainEvent['type'],
	state: DistributionState,
	command: DistributionCommand,
	payload: Readonly<Record<string, unknown>> = {},
	channelId?: string,
): DistributionV2DomainEvent {
	return {
		id: `${state.id}:${command.commandId}:${type}`,
		type,
		distributionId: state.id,
		channelId,
		commandId: command.commandId,
		occurredAt: command.occurredAt,
		payload,
	};
}

function withStatus(
	state: DistributionState,
	status: DistributionV2Status,
	command: DistributionCommand,
): DistributionState {
	return {
		...state,
		status,
		version: state.version + 1,
		lastCommandId: command.commandId,
	};
}

function assertStatus(
	state: DistributionState,
	expected: DistributionV2Status | readonly DistributionV2Status[],
	command: DistributionCommand,
): void {
	const statuses = Array.isArray(expected) ? expected : [expected];
	if (!statuses.includes(state.status)) {
		throw invalidTransition('Distribution', state.status, command.type);
	}
}

function assertCommandMetadata(command: DistributionCommand): void {
	if (typeof command.commandId !== 'string' || !command.commandId.trim()) {
		throw invariantViolation('Distribution', 'commandId is required');
	}
	if (
		typeof command.occurredAt !== 'string' ||
		Number.isNaN(Date.parse(command.occurredAt))
	) {
		throw invariantViolation(
			'Distribution',
			'occurredAt must be a valid ISO date',
		);
	}
}

function nextAfterValidation(
	state: DistributionState,
	requiresReview: boolean,
): DistributionV2Status {
	if (requiresReview) return DistributionV2Status.WAITING_REVIEW;
	const policy = policyFor(state.type);
	if (state.type === DistributionV2ExecutionType.TAKEDOWN) {
		return DistributionV2Status.DISTRIBUTING;
	}
	return policy.needsProvisioning
		? DistributionV2Status.PROVISIONING_IDS
		: DistributionV2Status.BUILDING_PACKAGE;
}

function deriveTerminalStatus(
	state: DistributionState,
): DistributionV2Status | null {
	const channels = state.channels;
	if (
		channels.length === 0 ||
		channels.some((channel) => !CHANNEL_TERMINAL_STATES.has(channel.status))
	) {
		return null;
	}

	const hasLive = channels.some(
		(channel) => channel.status === DistributionV2ChannelStatus.LIVE,
	);
	const hasIssues = channels.some(
		(channel) => channel.status === DistributionV2ChannelStatus.ISSUES,
	);
	const hasTakenDown = channels.some(
		(channel) => channel.status === DistributionV2ChannelStatus.TAKEN_DOWN,
	);

	if (
		state.type === DistributionV2ExecutionType.TAKEDOWN &&
		hasTakenDown &&
		!hasLive &&
		!hasIssues
	) {
		return DistributionV2Status.TAKEN_DOWN;
	}
	if (hasLive && hasIssues) return DistributionV2Status.PARTIALLY_DISTRIBUTED;
	if (hasLive) return DistributionV2Status.DISTRIBUTED;
	return DistributionV2Status.FAILED;
}

function applyChannelCommand(
	state: DistributionState,
	command: Extract<DistributionCommand, { type: 'CHANNEL_COMMAND' }>,
	retryPolicy: RetryPolicyV2,
): DistributionReduction {
	assertStatus(state, DistributionV2Status.DISTRIBUTING, command);
	const channel = state.channels.find(
		(item) => item.id === command.channelId,
	);
	if (!channel) {
		throw invariantViolation(
			'Distribution',
			`unknown channel ${command.channelId}`,
		);
	}

	const channelCommand = {
		...command.channelCommand,
		commandId: command.commandId,
		occurredAt: command.occurredAt,
	} as ChannelDeliveryCommand;
	const reduction = reduceChannelDelivery(
		channel,
		channelCommand,
		retryPolicy,
	);
	if (!reduction.event && reduction.state === channel) {
		return { state, events: [] };
	}
	const channels = state.channels.map((item) =>
		item.id === channel.id ? reduction.state : item,
	);
	let nextState: DistributionState = {
		...state,
		channels,
		version: state.version + 1,
		lastCommandId: command.commandId,
	};
	const events: DistributionV2DomainEvent[] = [];

	if (reduction.event) {
		events.push({
			id: `${state.id}:${command.channelId}:${command.commandId}:${reduction.event.type}`,
			type: reduction.event.type,
			distributionId: state.id,
			channelId: command.channelId,
			commandId: command.commandId,
			occurredAt: command.occurredAt,
			payload: {
				from: channel.status,
				to: reduction.state.status,
				...reduction.event.payload,
			},
		});
	}

	const terminalStatus = deriveTerminalStatus(nextState);
	if (terminalStatus) {
		const previousStatus = nextState.status;
		nextState = withStatus(nextState, terminalStatus, command);
		events.push(
			event('distribution.completed', nextState, command, {
				from: previousStatus,
				to: terminalStatus,
				channelCount: channels.length,
			}),
		);
	}

	return { state: nextState, events };
}

export function createDistributionState(input: {
	readonly id: string;
	readonly releaseId: string;
	readonly tenantId: string;
	readonly snapshotId: string;
	readonly correlationId: string;
	readonly type: DistributionV2ExecutionType;
	readonly channels: readonly {
		readonly id: string;
		readonly dspCode: string;
		readonly route: DistributionState['channels'][number]['route'];
		readonly aggregatorCode?: string | null;
		readonly previousLive?: boolean;
	}[];
}): DistributionState {
	if (!input.id.trim())
		throw invariantViolation('Distribution', 'id is required');
	if (!input.releaseId.trim()) {
		throw invariantViolation('Distribution', 'releaseId is required');
	}
	if (!input.tenantId.trim()) {
		throw invariantViolation('Distribution', 'tenantId is required');
	}
	if (!input.snapshotId.trim()) {
		throw invariantViolation('Distribution', 'snapshotId is required');
	}
	if (!input.correlationId.trim()) {
		throw invariantViolation('Distribution', 'correlationId is required');
	}
	if (input.channels.length === 0) {
		throw invariantViolation(
			'Distribution',
			'at least one channel is required',
		);
	}
	const channelIds = new Set<string>();
	for (const channel of input.channels) {
		if (channelIds.has(channel.id)) {
			throw invariantViolation(
				'Distribution',
				`duplicate channel id ${channel.id}`,
			);
		}
		channelIds.add(channel.id);
	}

	return {
		id: input.id,
		releaseId: input.releaseId,
		tenantId: input.tenantId,
		snapshotId: input.snapshotId,
		correlationId: input.correlationId,
		type: input.type,
		status: DistributionV2Status.SUBMITTED,
		version: 0,
		channels: input.channels.map((channel) =>
			createChannelDeliveryState(channel),
		),
		lastCommandId: undefined,
	};
}

export function reduceDistribution(
	state: DistributionState,
	command: DistributionCommand,
	retryPolicy = new RetryPolicyV2(),
): DistributionReduction {
	assertCommandMetadata(command);
	if (state.lastCommandId === command.commandId) {
		return { state, events: [] };
	}

	switch (command.type) {
		case 'START_VALIDATION': {
			assertStatus(state, DistributionV2Status.SUBMITTED, command);
			const next = withStatus(
				state,
				DistributionV2Status.VALIDATING,
				command,
			);
			return {
				state: next,
				events: [
					event('distribution.validation_started', next, command),
				],
			};
		}

		case 'VALIDATION_SUCCEEDED': {
			assertStatus(state, DistributionV2Status.VALIDATING, command);
			const status = nextAfterValidation(state, command.requiresReview);
			const next = withStatus(state, status, command);
			const events: DistributionV2DomainEvent[] = [
				event('distribution.validated', next, command, {
					to: status,
					requiresReview: command.requiresReview,
				}),
			];
			if (status === DistributionV2Status.WAITING_REVIEW) {
				events.push(
					event('distribution.review_requested', next, command, {
						requiresReview: true,
					}),
				);
			}
			return { state: next, events };
		}

		case 'VALIDATION_FAILED': {
			assertStatus(state, DistributionV2Status.VALIDATING, command);
			if (command.issues.length === 0) {
				throw invariantViolation(
					'Distribution',
					'VALIDATION_FAILED requires at least one issue',
				);
			}
			const next = withStatus(
				state,
				DistributionV2Status.ACTION_REQUIRED,
				command,
			);
			return {
				state: next,
				events: [
					event('distribution.validation_failed', next, command, {
						issues: command.issues,
					}),
				],
			};
		}

		case 'REVIEW_APPROVED': {
			assertStatus(state, DistributionV2Status.WAITING_REVIEW, command);
			if (!command.reviewerId.trim()) {
				throw invariantViolation(
					'Distribution',
					'REVIEW_APPROVED requires reviewerId',
				);
			}
			const status = nextAfterValidation(state, false);
			const next = withStatus(state, status, command);
			return {
				state: next,
				events: [
					event('distribution.review_approved', next, command, {
						reviewerId: command.reviewerId,
						to: status,
					}),
				],
			};
		}

		case 'REVIEW_REJECTED': {
			assertStatus(state, DistributionV2Status.WAITING_REVIEW, command);
			if (!command.reviewerId.trim() || !command.reason.trim()) {
				throw invariantViolation(
					'Distribution',
					'REVIEW_REJECTED requires reviewerId and reason',
				);
			}
			const next = withStatus(
				state,
				DistributionV2Status.ACTION_REQUIRED,
				command,
			);
			return {
				state: next,
				events: [
					event('distribution.review_rejected', next, command, {
						reviewerId: command.reviewerId,
						reason: command.reason,
					}),
				],
			};
		}

		case 'RESUBMIT': {
			assertStatus(state, DistributionV2Status.ACTION_REQUIRED, command);
			if (!command.snapshotId.trim()) {
				throw invariantViolation(
					'Distribution',
					'RESUBMIT requires snapshotId',
				);
			}

			const channels = command.channels
				? command.channels.map((channel) =>
						createChannelDeliveryState(channel),
					)
				: state.channels.map((channel) =>
						createChannelDeliveryState({
							id: channel.id,
							dspCode: channel.dspCode,
							route: channel.route,
							aggregatorCode: channel.aggregatorCode,
							previousLive: channel.previousLive,
						}),
					);
			if (channels.length === 0) {
				throw invariantViolation(
					'Distribution',
					'RESUBMIT requires at least one channel',
				);
			}
			if (
				new Set(channels.map((channel) => channel.id)).size !==
				channels.length
			) {
				throw invariantViolation(
					'Distribution',
					'RESUBMIT channels must have unique ids',
				);
			}

			const next = withStatus(
				{
					...state,
					snapshotId: command.snapshotId,
					channels,
				},
				DistributionV2Status.SUBMITTED,
				command,
			);
			return {
				state: next,
				events: [
					event('distribution.resubmitted', next, command, {
						snapshotId: command.snapshotId,
						channelCount: channels.length,
					}),
				],
			};
		}

		case 'IDENTIFIERS_PROVISIONED': {
			assertStatus(state, DistributionV2Status.PROVISIONING_IDS, command);
			if (Object.keys(command.identifiers).length === 0) {
				throw invariantViolation(
					'Distribution',
					'IDENTIFIERS_PROVISIONED requires identifiers',
				);
			}
			const next = withStatus(
				state,
				DistributionV2Status.BUILDING_PACKAGE,
				command,
			);
			return {
				state: next,
				events: [
					event('distribution.ids_provisioned', next, command, {
						identifierCount: Object.keys(command.identifiers)
							.length,
					}),
				],
			};
		}

		case 'PACKAGE_BUILT': {
			assertStatus(state, DistributionV2Status.BUILDING_PACKAGE, command);
			if (!command.packageUri.trim() || !command.checksum.trim()) {
				throw invariantViolation(
					'Distribution',
					'PACKAGE_BUILT requires packageUri and checksum',
				);
			}
			const next = withStatus(
				state,
				DistributionV2Status.DISTRIBUTING,
				command,
			);
			return {
				state: next,
				events: [
					event('distribution.package_built', next, command, {
						packageUri: command.packageUri,
						checksum: command.checksum,
					}),
				],
			};
		}

		case 'CHANNEL_COMMAND':
			return applyChannelCommand(state, command, retryPolicy);

		case 'RETRY_CHANNELS': {
			assertStatus(
				state,
				[
					DistributionV2Status.FAILED,
					DistributionV2Status.PARTIALLY_DISTRIBUTED,
				],
				command,
			);
			const requested = command.channelIds
				? new Set(command.channelIds)
				: undefined;
			if (requested) {
				const unknownChannelIds = [...requested].filter(
					(channelId) =>
						!state.channels.some(
							(channel) => channel.id === channelId,
						),
				);
				if (unknownChannelIds.length > 0) {
					throw invariantViolation(
						'Distribution',
						`unknown channel(s) ${unknownChannelIds.join(', ')}`,
					);
				}
			}
			const issueChannels = state.channels.filter(
				(channel) =>
					channel.status === DistributionV2ChannelStatus.ISSUES &&
					(!requested || requested.has(channel.id)),
			);
			if (issueChannels.length === 0) {
				throw invariantViolation(
					'Distribution',
					'RETRY_CHANNELS requires at least one ISSUES channel',
				);
			}

			const channels = state.channels.map((channel) => {
				if (!issueChannels.some((item) => item.id === channel.id)) {
					return channel;
				}
				const channelCommand: ChannelDeliveryCommand = {
					type: 'RESET_FOR_RETRY',
					commandId: `${command.commandId}:${channel.id}`,
					occurredAt: command.occurredAt,
				};
				return reduceChannelDelivery(
					channel,
					channelCommand,
					retryPolicy,
				).state;
			});
			const next: DistributionState = {
				...state,
				status: DistributionV2Status.DISTRIBUTING,
				channels,
				version: state.version + 1,
				lastCommandId: command.commandId,
			};
			return {
				state: next,
				events: [
					event('distribution.retry_requested', next, command, {
						channelIds: issueChannels.map((channel) => channel.id),
					}),
					...issueChannels.map((channel) =>
						event(
							'channel.retry_reset',
							next,
							command,
							{
								retryCount:
									channels.find(
										(item) => item.id === channel.id,
									)?.retryCount ?? 0,
							},
							channel.id,
						),
					),
				],
			};
		}
	}
}
