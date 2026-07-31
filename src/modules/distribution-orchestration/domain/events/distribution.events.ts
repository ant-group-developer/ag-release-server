import { DomainEvent, makeEvent } from './domain-event.base';

/**
 * Distribution-level domain events (spec §Domain Events).
 * Each is a small factory: the `type` string = the factory name minus `make`.
 * All are milestone-level (they accompany a state transition). The timeline (phase 3)
 * maps `type` → a UI line by `level`.
 */

export const makeDistributionSubmitted = (
	distributionId: string,
	at: Date,
	data: { channelCount: number; snapshotId: string },
): DomainEvent =>
	makeEvent('DistributionSubmitted', distributionId, at, {
		level: 'milestone',
		...data,
	});

export const makeValidated = (
	distributionId: string,
	at: Date,
	data: { next: string },
): DomainEvent =>
	makeEvent('Validated', distributionId, at, { level: 'milestone', ...data });

export const makeValidationErrorsFlagged = (
	distributionId: string,
	at: Date,
	data: { ticketRef: string; errors: string[] },
): DomainEvent =>
	makeEvent('ValidationErrorsFlagged', distributionId, at, {
		level: 'milestone',
		...data,
	});

export const makeReviewApproved = (
	distributionId: string,
	at: Date,
	data: { reviewerId: string; next: string },
): DomainEvent =>
	makeEvent('ReviewApproved', distributionId, at, {
		level: 'milestone',
		...data,
	});

export const makeReviewRejected = (
	distributionId: string,
	at: Date,
	data: { reviewerId: string; ticketRef: string; note: string },
): DomainEvent =>
	makeEvent('ReviewRejected', distributionId, at, {
		level: 'milestone',
		...data,
	});

export const makeResubmitted = (
	distributionId: string,
	at: Date,
): DomainEvent =>
	makeEvent('Resubmitted', distributionId, at, { level: 'milestone' });

export const makeIdsProvisioned = (
	distributionId: string,
	at: Date,
	data: { upc?: string },
): DomainEvent =>
	makeEvent('IdsProvisioned', distributionId, at, {
		level: 'milestone',
		...data,
	});

export const makePackageBuilt = (
	distributionId: string,
	at: Date,
	data: { packageUris: Record<string, string> },
): DomainEvent =>
	makeEvent('PackageBuilt', distributionId, at, {
		level: 'milestone',
		...data,
	});

export const makeDistributed = (
	distributionId: string,
	at: Date,
): DomainEvent =>
	makeEvent('Distributed', distributionId, at, { level: 'milestone' });

export const makePartiallyDistributed = (
	distributionId: string,
	at: Date,
	data: { liveCount: number; issuesCount: number },
): DomainEvent =>
	makeEvent('PartiallyDistributed', distributionId, at, {
		level: 'milestone',
		...data,
	});

export const makeDistributionFailed = (
	distributionId: string,
	at: Date,
): DomainEvent =>
	makeEvent('DistributionFailed', distributionId, at, { level: 'milestone' });

export const makeRetryReset = (
	distributionId: string,
	at: Date,
	data: { scope: string },
): DomainEvent =>
	makeEvent('RetryReset', distributionId, at, {
		level: 'milestone',
		...data,
	});

export const makeTakenDown = (distributionId: string, at: Date): DomainEvent =>
	makeEvent('TakenDown', distributionId, at, { level: 'milestone' });

/**
 * WatcherSpawned — 1 go-live watcher per-DSP nở ra sau khi CI cluster xong shared-stages.
 * Projection map watcher → dsp_code để theo dõi go-live per-DSP. distributionId-level event
 * (channelId để trống ở cấp distribution; dspCode nằm trong payload).
 */
export const makeWatcherSpawned = (
	distributionId: string,
	at: Date,
	data: {
		clusterChannelId: string;
		watcherChannelId: string;
		dspCode: string;
	},
): DomainEvent =>
	makeEvent('WatcherSpawned', distributionId, at, {
		level: 'milestone',
		...data,
	});
