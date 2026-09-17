import {
	ChannelDelivery,
	Distribution,
	DistributionV2ChannelRoute,
	DistributionV2ChannelStatus,
	DistributionV2ExecutionType,
	DistributionV2Status,
	DistributionV2WaitReason,
	RetryPolicyV2,
} from './index';

const at = '2026-09-17T00:00:00.000Z';

function makeDistribution(
	type = DistributionV2ExecutionType.INITIAL,
	channelCount = 1,
) {
	return Distribution.create({
		id: 'distribution-1',
		releaseId: 'release-1',
		tenantId: 'tenant-1',
		snapshotId: 'snapshot-1',
		correlationId: 'correlation-1',
		type,
		channels: Array.from({ length: channelCount }, (_, index) => ({
			id: `channel-${index + 1}`,
			dspCode: index === 0 ? 'SPOTIFY' : `DSP_${index + 1}`,
			route: DistributionV2ChannelRoute.DIRECT,
		})),
	});
}

function commandId(name: string): string {
	return `command-${name}`;
}

describe('distribution-v2 domain state machine', () => {
	it('runs INITIAL through validation, identifiers and package build', () => {
		const distribution = makeDistribution();

		expect(
			distribution.apply({
				type: 'START_VALIDATION',
				commandId: commandId('validate-start'),
				occurredAt: at,
			}),
		).toHaveLength(1);
		expect(distribution.status).toBe(DistributionV2Status.VALIDATING);

		distribution.apply({
			type: 'VALIDATION_SUCCEEDED',
			commandId: commandId('validate-pass'),
			occurredAt: at,
			requiresReview: false,
		});
		expect(distribution.status).toBe(DistributionV2Status.PROVISIONING_IDS);

		distribution.apply({
			type: 'IDENTIFIERS_PROVISIONED',
			commandId: commandId('ids'),
			occurredAt: at,
			identifiers: { release: '0850080651025' },
		});
		expect(distribution.status).toBe(DistributionV2Status.BUILDING_PACKAGE);

		distribution.apply({
			type: 'PACKAGE_BUILT',
			commandId: commandId('package'),
			occurredAt: at,
			packageUri: 'v2/distribution-1/1',
			checksum: 'sha256:abc',
		});
		expect(distribution.status).toBe(DistributionV2Status.DISTRIBUTING);
	});

	it('is idempotent when a channel is used independently', () => {
		const channel = ChannelDelivery.create({
			id: 'channel-1',
			dspCode: 'SPOTIFY',
			route: DistributionV2ChannelRoute.DIRECT,
		});
		const command = {
			type: 'START_PROCESSING' as const,
			commandId: 'channel-command-1',
			occurredAt: at,
			stage: 'upload',
		};

		expect(channel.apply(command, 'distribution-1')).toHaveLength(1);
		expect(channel.apply(command, 'distribution-1')).toHaveLength(0);
		expect(channel.state.lastCommandId).toBe(command.commandId);
	});

	it('rejects malformed command metadata before idempotency checks', () => {
		const distribution = makeDistribution();

		expect(() =>
			distribution.apply({
				type: 'START_VALIDATION',
				commandId: '',
				occurredAt: at,
			}),
		).toThrow('commandId is required');
		expect(() =>
			distribution.apply({
				type: 'START_VALIDATION',
				commandId: 'invalid-date',
				occurredAt: 'not-a-date',
			}),
		).toThrow('occurredAt must be a valid ISO date');
	});

	it('routes review before provisioning and is idempotent for a duplicate command', () => {
		const distribution = makeDistribution();

		distribution.apply({
			type: 'START_VALIDATION',
			commandId: commandId('review-start'),
			occurredAt: at,
		});
		const first = distribution.apply({
			type: 'VALIDATION_SUCCEEDED',
			commandId: commandId('review-request'),
			occurredAt: at,
			requiresReview: true,
		});
		const duplicate = distribution.apply({
			type: 'VALIDATION_SUCCEEDED',
			commandId: commandId('review-request'),
			occurredAt: at,
			requiresReview: true,
		});

		expect(distribution.status).toBe(DistributionV2Status.WAITING_REVIEW);
		expect(first).toHaveLength(2);
		expect(duplicate).toHaveLength(0);

		distribution.apply({
			type: 'REVIEW_APPROVED',
			commandId: commandId('review-approved'),
			occurredAt: at,
			reviewerId: 'reviewer-1',
		});
		expect(distribution.status).toBe(DistributionV2Status.PROVISIONING_IDS);
	});

	it('resubmits an action-required distribution with a fresh snapshot', () => {
		const distribution = makeDistribution();

		distribution.apply({
			type: 'START_VALIDATION',
			commandId: commandId('resubmit-start'),
			occurredAt: at,
		});
		distribution.apply({
			type: 'VALIDATION_FAILED',
			commandId: commandId('resubmit-fail'),
			occurredAt: at,
			issues: [{ code: 'MISSING_TITLE' }],
		});
		expect(distribution.status).toBe(DistributionV2Status.ACTION_REQUIRED);

		const events = distribution.apply({
			type: 'RESUBMIT',
			commandId: commandId('resubmit'),
			occurredAt: at,
			snapshotId: 'snapshot-2',
		});

		expect(events[0].type).toBe('distribution.resubmitted');
		expect(distribution.status).toBe(DistributionV2Status.SUBMITTED);
		expect(distribution.state.snapshotId).toBe('snapshot-2');
		expect(distribution.channels[0].status).toBe(
			DistributionV2ChannelStatus.PENDING,
		);
	});

	it('skips identifier provisioning for UPDATE', () => {
		const distribution = makeDistribution(
			DistributionV2ExecutionType.UPDATE,
		);
		distribution.apply({
			type: 'START_VALIDATION',
			commandId: commandId('update-start'),
			occurredAt: at,
		});
		distribution.apply({
			type: 'VALIDATION_SUCCEEDED',
			commandId: commandId('update-pass'),
			occurredAt: at,
			requiresReview: false,
		});

		expect(distribution.status).toBe(DistributionV2Status.BUILDING_PACKAGE);
	});

	it('skips identifiers and package build for TAKEDOWN', () => {
		const distribution = makeDistribution(
			DistributionV2ExecutionType.TAKEDOWN,
		);
		distribution.apply({
			type: 'START_VALIDATION',
			commandId: commandId('takedown-start'),
			occurredAt: at,
		});
		distribution.apply({
			type: 'VALIDATION_SUCCEEDED',
			commandId: commandId('takedown-pass'),
			occurredAt: at,
			requiresReview: false,
		});

		expect(distribution.status).toBe(DistributionV2Status.DISTRIBUTING);
	});

	it('requires a valid schedule for WAITING_EXTERNAL', () => {
		const distribution = makeDistribution();
		distribution.apply({
			type: 'START_VALIDATION',
			commandId: commandId('wait-start'),
			occurredAt: at,
		});
		distribution.apply({
			type: 'VALIDATION_SUCCEEDED',
			commandId: commandId('wait-pass'),
			occurredAt: at,
			requiresReview: false,
		});
		distribution.apply({
			type: 'IDENTIFIERS_PROVISIONED',
			commandId: commandId('wait-ids'),
			occurredAt: at,
			identifiers: { release: '0850080651025' },
		});
		distribution.apply({
			type: 'PACKAGE_BUILT',
			commandId: commandId('wait-package'),
			occurredAt: at,
			packageUri: 'v2/distribution-1/1',
			checksum: 'sha256:abc',
		});
		distribution.apply({
			type: 'CHANNEL_COMMAND',
			commandId: commandId('wait-processing'),
			occurredAt: at,
			channelId: 'channel-1',
			channelCommand: {
				type: 'START_PROCESSING',
				stage: 'upload',
			},
		});

		expect(() =>
			distribution.apply({
				type: 'CHANNEL_COMMAND',
				commandId: commandId('bad-wait'),
				occurredAt: at,
				channelId: 'channel-1',
				channelCommand: {
					type: 'WAIT_EXTERNAL',
					reason: DistributionV2WaitReason.PARTNER,
					scheduledAt: 'not-a-date',
					stage: 'partner',
				},
			}),
		).toThrow('requires a valid scheduledAt');

		distribution.apply({
			type: 'CHANNEL_COMMAND',
			commandId: commandId('good-wait'),
			occurredAt: at,
			channelId: 'channel-1',
			channelCommand: {
				type: 'WAIT_EXTERNAL',
				reason: DistributionV2WaitReason.PARTNER,
				scheduledAt: '2026-09-18T00:00:00.000Z',
				stage: 'partner',
			},
		});
		expect(distribution.channels[0].status).toBe(
			DistributionV2ChannelStatus.WAITING_EXTERNAL,
		);
	});

	it('derives DISTRIBUTED, PARTIALLY_DISTRIBUTED and FAILED', () => {
		const complete = makeDistribution();
		complete.apply({
			type: 'START_VALIDATION',
			commandId: commandId('complete-start'),
			occurredAt: at,
		});
		complete.apply({
			type: 'VALIDATION_SUCCEEDED',
			commandId: commandId('complete-pass'),
			occurredAt: at,
			requiresReview: false,
		});
		complete.apply({
			type: 'IDENTIFIERS_PROVISIONED',
			commandId: commandId('complete-ids'),
			occurredAt: at,
			identifiers: { release: '0850080651025' },
		});
		complete.apply({
			type: 'PACKAGE_BUILT',
			commandId: commandId('complete-package'),
			occurredAt: at,
			packageUri: 'v2/distribution-1/1',
			checksum: 'sha256:abc',
		});
		complete.apply({
			type: 'CHANNEL_COMMAND',
			commandId: commandId('complete-live'),
			occurredAt: at,
			channelId: 'channel-1',
			channelCommand: { type: 'START_PROCESSING', stage: 'sync' },
		});
		complete.apply({
			type: 'CHANNEL_COMMAND',
			commandId: commandId('complete-live-result'),
			occurredAt: at,
			channelId: 'channel-1',
			channelCommand: { type: 'MARK_LIVE', stage: 'live' },
		});
		expect(complete.status).toBe(DistributionV2Status.DISTRIBUTED);

		const partial = makeDistribution(
			DistributionV2ExecutionType.INITIAL,
			2,
		);
		partial.apply({
			type: 'START_VALIDATION',
			commandId: commandId('partial-start'),
			occurredAt: at,
		});
		partial.apply({
			type: 'VALIDATION_SUCCEEDED',
			commandId: commandId('partial-pass'),
			occurredAt: at,
			requiresReview: false,
		});
		partial.apply({
			type: 'IDENTIFIERS_PROVISIONED',
			commandId: commandId('partial-ids'),
			occurredAt: at,
			identifiers: { release: '0850080651025' },
		});
		partial.apply({
			type: 'PACKAGE_BUILT',
			commandId: commandId('partial-package'),
			occurredAt: at,
			packageUri: 'v2/distribution-1/1',
			checksum: 'sha256:abc',
		});
		partial.apply({
			type: 'CHANNEL_COMMAND',
			commandId: commandId('partial-live-start'),
			occurredAt: at,
			channelId: 'channel-1',
			channelCommand: { type: 'START_PROCESSING', stage: 'sync' },
		});
		partial.apply({
			type: 'CHANNEL_COMMAND',
			commandId: commandId('partial-live'),
			occurredAt: at,
			channelId: 'channel-1',
			channelCommand: { type: 'MARK_LIVE', stage: 'live' },
		});
		partial.apply({
			type: 'CHANNEL_COMMAND',
			commandId: commandId('partial-issue'),
			occurredAt: at,
			channelId: 'channel-2',
			channelCommand: {
				type: 'OPEN_ISSUE',
				code: 'UPLOAD_FAILED',
				message: 'SFTP unavailable',
			},
		});
		expect(partial.status).toBe(DistributionV2Status.PARTIALLY_DISTRIBUTED);

		const failed = makeDistribution();
		failed.apply({
			type: 'START_VALIDATION',
			commandId: commandId('failed-start'),
			occurredAt: at,
		});
		failed.apply({
			type: 'VALIDATION_SUCCEEDED',
			commandId: commandId('failed-pass'),
			occurredAt: at,
			requiresReview: false,
		});
		failed.apply({
			type: 'IDENTIFIERS_PROVISIONED',
			commandId: commandId('failed-ids'),
			occurredAt: at,
			identifiers: { release: '0850080651025' },
		});
		failed.apply({
			type: 'PACKAGE_BUILT',
			commandId: commandId('failed-package'),
			occurredAt: at,
			packageUri: 'v2/distribution-1/1',
			checksum: 'sha256:abc',
		});
		failed.apply({
			type: 'CHANNEL_COMMAND',
			commandId: commandId('failed-issue'),
			occurredAt: at,
			channelId: 'channel-1',
			channelCommand: {
				type: 'OPEN_ISSUE',
				code: 'UPLOAD_FAILED',
				message: 'SFTP unavailable',
			},
		});
		expect(failed.status).toBe(DistributionV2Status.FAILED);
	});

	it('resets only issue channels and enforces retry limit', () => {
		const distribution = makeDistribution(
			DistributionV2ExecutionType.INITIAL,
			2,
		);
		distribution.apply({
			type: 'START_VALIDATION',
			commandId: commandId('retry-start'),
			occurredAt: at,
		});
		distribution.apply({
			type: 'VALIDATION_SUCCEEDED',
			commandId: commandId('retry-pass'),
			occurredAt: at,
			requiresReview: false,
		});
		distribution.apply({
			type: 'IDENTIFIERS_PROVISIONED',
			commandId: commandId('retry-ids'),
			occurredAt: at,
			identifiers: { release: '0850080651025' },
		});
		distribution.apply({
			type: 'PACKAGE_BUILT',
			commandId: commandId('retry-package'),
			occurredAt: at,
			packageUri: 'v2/distribution-1/1',
			checksum: 'sha256:abc',
		});
		distribution.apply({
			type: 'CHANNEL_COMMAND',
			commandId: commandId('retry-live-start'),
			occurredAt: at,
			channelId: 'channel-1',
			channelCommand: { type: 'START_PROCESSING', stage: 'sync' },
		});
		distribution.apply({
			type: 'CHANNEL_COMMAND',
			commandId: commandId('retry-live'),
			occurredAt: at,
			channelId: 'channel-1',
			channelCommand: { type: 'MARK_LIVE', stage: 'live' },
		});
		distribution.apply({
			type: 'CHANNEL_COMMAND',
			commandId: commandId('retry-issue'),
			occurredAt: at,
			channelId: 'channel-2',
			channelCommand: {
				type: 'OPEN_ISSUE',
				code: 'UPLOAD_FAILED',
				message: 'SFTP unavailable',
			},
		});

		distribution.apply({
			type: 'RETRY_CHANNELS',
			commandId: commandId('retry-reset'),
			occurredAt: at,
		});

		expect(distribution.status).toBe(DistributionV2Status.DISTRIBUTING);
		expect(distribution.channels[0].status).toBe(
			DistributionV2ChannelStatus.LIVE,
		);
		expect(distribution.channels[1].status).toBe(
			DistributionV2ChannelStatus.PENDING,
		);
		expect(distribution.channels[1].retryCount).toBe(1);

		const policy = new RetryPolicyV2({ maxRetries: 0 });
		expect(() =>
			Distribution.rehydrate(distribution.state, policy).apply({
				type: 'CHANNEL_COMMAND',
				commandId: commandId('retry-issue-again'),
				occurredAt: at,
				channelId: 'channel-2',
				channelCommand: {
					type: 'OPEN_ISSUE',
					code: 'UPLOAD_FAILED',
					message: 'Still unavailable',
				},
			}),
		).not.toThrow();

		const issue = Distribution.rehydrate(distribution.state, policy);
		issue.apply({
			type: 'CHANNEL_COMMAND',
			commandId: commandId('retry-processing'),
			occurredAt: at,
			channelId: 'channel-2',
			channelCommand: { type: 'START_PROCESSING', stage: 'upload' },
		});
		issue.apply({
			type: 'CHANNEL_COMMAND',
			commandId: commandId('retry-issue-final'),
			occurredAt: at,
			channelId: 'channel-2',
			channelCommand: {
				type: 'OPEN_ISSUE',
				code: 'UPLOAD_FAILED',
				message: 'Still unavailable',
			},
		});
		expect(() =>
			issue.apply({
				type: 'RETRY_CHANNELS',
				commandId: commandId('retry-limit'),
				occurredAt: at,
			}),
		).toThrow('retry limit exceeded');
	});

	it('transitions TAKEDOWN channels to TAKEN_DOWN', () => {
		const distribution = makeDistribution(
			DistributionV2ExecutionType.TAKEDOWN,
		);
		distribution.apply({
			type: 'START_VALIDATION',
			commandId: commandId('down-start'),
			occurredAt: at,
		});
		distribution.apply({
			type: 'VALIDATION_SUCCEEDED',
			commandId: commandId('down-pass'),
			occurredAt: at,
			requiresReview: false,
		});
		distribution.apply({
			type: 'CHANNEL_COMMAND',
			commandId: commandId('down-processing'),
			occurredAt: at,
			channelId: 'channel-1',
			channelCommand: { type: 'START_PROCESSING', stage: 'request' },
		});
		distribution.apply({
			type: 'CHANNEL_COMMAND',
			commandId: commandId('down-result'),
			occurredAt: at,
			channelId: 'channel-1',
			channelCommand: { type: 'MARK_TAKEN_DOWN', stage: 'confirmed' },
		});

		expect(distribution.status).toBe(DistributionV2Status.TAKEN_DOWN);
	});
});
