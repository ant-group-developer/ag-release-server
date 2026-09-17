import {
	DistributionV2ChannelStatus,
	DistributionV2ExecutionType,
	DistributionV2Status,
} from '../../enums/distribution-v2.enum';
import {
	ChannelDeliveryCommandInput,
	ChannelDeliveryState,
	CreateChannelDeliveryInput,
} from '../channel/channel-delivery.types';
import { DistributionV2DomainEvent } from '../events/distribution-v2.domain-event';

export interface DistributionState {
	readonly id: string;
	readonly releaseId: string;
	readonly tenantId: string;
	readonly snapshotId: string;
	readonly correlationId: string;
	readonly type: DistributionV2ExecutionType;
	readonly status: DistributionV2Status;
	readonly version: number;
	readonly channels: readonly ChannelDeliveryState[];
	readonly lastCommandId?: string;
}

export interface CreateDistributionInput {
	readonly id: string;
	readonly releaseId: string;
	readonly tenantId: string;
	readonly snapshotId: string;
	readonly correlationId: string;
	readonly type: DistributionV2ExecutionType;
	readonly channels: readonly {
		readonly id: string;
		readonly dspCode: string;
		readonly route: ChannelDeliveryState['route'];
		readonly aggregatorCode?: string | null;
		readonly previousLive?: boolean;
	}[];
}

export type DistributionCommand =
	| {
			readonly type: 'START_VALIDATION';
			readonly commandId: string;
			readonly occurredAt: string;
	  }
	| {
			readonly type: 'VALIDATION_SUCCEEDED';
			readonly commandId: string;
			readonly occurredAt: string;
			readonly requiresReview: boolean;
	  }
	| {
			readonly type: 'VALIDATION_FAILED';
			readonly commandId: string;
			readonly occurredAt: string;
			readonly issues: readonly Readonly<Record<string, unknown>>[];
	  }
	| {
			readonly type: 'REVIEW_APPROVED';
			readonly commandId: string;
			readonly occurredAt: string;
			readonly reviewerId: string;
	  }
	| {
			readonly type: 'REVIEW_REJECTED';
			readonly commandId: string;
			readonly occurredAt: string;
			readonly reviewerId: string;
			readonly reason: string;
	  }
	| {
			readonly type: 'RESUBMIT';
			readonly commandId: string;
			readonly occurredAt: string;
			readonly snapshotId: string;
			readonly channels?: readonly CreateChannelDeliveryInput[];
	  }
	| {
			readonly type: 'IDENTIFIERS_PROVISIONED';
			readonly commandId: string;
			readonly occurredAt: string;
			readonly identifiers: Readonly<Record<string, string>>;
	  }
	| {
			readonly type: 'PACKAGE_BUILT';
			readonly commandId: string;
			readonly occurredAt: string;
			readonly packageUri: string;
			readonly checksum: string;
	  }
	| {
			readonly type: 'CHANNEL_COMMAND';
			readonly commandId: string;
			readonly occurredAt: string;
			readonly channelId: string;
			readonly channelCommand: ChannelDeliveryCommandInput;
	  }
	| {
			readonly type: 'RETRY_CHANNELS';
			readonly commandId: string;
			readonly occurredAt: string;
			readonly channelIds?: readonly string[];
	  };

export interface DistributionReduction {
	readonly state: DistributionState;
	readonly events: readonly DistributionV2DomainEvent[];
}

export const CHANNEL_TERMINAL_STATES = new Set<DistributionV2ChannelStatus>([
	DistributionV2ChannelStatus.LIVE,
	DistributionV2ChannelStatus.ISSUES,
	DistributionV2ChannelStatus.TAKEN_DOWN,
	DistributionV2ChannelStatus.SKIPPED,
]);
