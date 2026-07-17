import { ChannelDeliverySpec } from '../channel-delivery/channel-delivery-spec';
import { ChannelState } from '../channel-delivery/channel-state.enum';
import { ExecutionTypeEnum } from '../value-objects/execution-type.enum';
import { DistributionState } from './distribution-state.enum';

/** Props to create a fresh Distribution (DRAFT). */
export interface CreateDistributionProps {
	readonly id: string;
	readonly releaseId: string;
	readonly snapshotId: string;
	readonly tenantId: string;
	readonly type: ExecutionTypeEnum;
	readonly correlationId: string;
	readonly channelSpecs: ChannelDeliverySpec[];
}

/** Persisted row to rehydrate a Distribution (phase 2 repo). */
export interface DistributionSnapshotRow {
	readonly id: string;
	readonly releaseId: string;
	readonly snapshotId: string;
	readonly tenantId: string;
	readonly type: ExecutionTypeEnum;
	readonly correlationId: string;
	readonly state: DistributionState;
	readonly upc?: string;
	readonly packageUri?: string;
	readonly retryCount: number;
	readonly version: number;
}

/** Which ISSUES channels to reset on retry (empty channelIds = all ISSUES channels). */
export interface RetryScope {
	readonly channelIds?: string[];
}

/**
 * resolveDistributionOutcome — bubble-up (INV-D4..D7). Pure: given the terminal channel states,
 * decide the distribution-level state. Returns null while any channel is still non-terminal
 * (stay DELIVERING — "still waiting" lives on the channel + scheduledAt, not bubbled up).
 */
export function resolveDistributionOutcome(
	channelStates: readonly ChannelState[],
): DistributionState | null {
	if (channelStates.length === 0) return null;

	const allTerminal = channelStates.every(
		(s) =>
			s === ChannelState.LIVE ||
			s === ChannelState.ISSUES ||
			s === ChannelState.TAKEN_DOWN ||
			s === ChannelState.SKIPPED,
	);
	if (!allTerminal) return null; // still waiting on some channel

	const hasLive = channelStates.includes(ChannelState.LIVE);
	const hasIssues = channelStates.includes(ChannelState.ISSUES);
	const hasTakenDown = channelStates.includes(ChannelState.TAKEN_DOWN);

	// takedown branch: every channel TAKEN_DOWN/SKIPPED with at least one taken down (INV-D7)
	if (hasTakenDown && !hasLive && !hasIssues) {
		return DistributionState.TAKEN_DOWN;
	}
	// ≥1 LIVE and ≥1 ISSUES → partial (INV-D5)
	if (hasLive && hasIssues) {
		return DistributionState.PARTIALLY_DISTRIBUTED;
	}
	// ≥1 LIVE and the rest only SKIPPED → distributed (INV-D4)
	if (hasLive) {
		return DistributionState.DISTRIBUTED;
	}
	// 0 LIVE, all terminal → failed (INV-D6)
	return DistributionState.FAILED;
}
