import {
	DistributionV2ChannelRoute,
	DistributionV2ChannelStatus,
	DistributionV2WaitReason,
} from '../../enums/distribution-v2.enum';

export interface ChannelDeliveryState {
	readonly id: string;
	readonly dspCode: string;
	readonly route: DistributionV2ChannelRoute;
	readonly aggregatorCode?: string | null;
	readonly status: DistributionV2ChannelStatus;
	readonly currentStage?: string | null;
	readonly retryCount: number;
	readonly waitReason?: DistributionV2WaitReason | null;
	readonly scheduledAt?: string | null;
	readonly lastError?: Readonly<Record<string, unknown>> | null;
	readonly externalRefs?: Readonly<Record<string, unknown>>;
	readonly previousLive?: boolean;
	/**
	 * Last applied command id for channel-level idempotency.
	 *
	 * The aggregate also keeps its own command id, but a channel can be
	 * rehydrated and exercised independently by a worker or a unit of work.
	 */
	readonly lastCommandId?: string;
}

export interface CreateChannelDeliveryInput {
	readonly id: string;
	readonly dspCode: string;
	readonly route: DistributionV2ChannelRoute;
	readonly aggregatorCode?: string | null;
	readonly previousLive?: boolean;
}

export type ChannelDeliveryCommand =
	| {
			readonly type: 'START_PROCESSING';
			readonly commandId: string;
			readonly occurredAt: string;
			readonly stage: string;
	  }
	| {
			readonly type: 'WAIT_EXTERNAL';
			readonly commandId: string;
			readonly occurredAt: string;
			readonly reason: DistributionV2WaitReason;
			readonly scheduledAt: string;
			readonly stage?: string;
			readonly externalRefs?: Readonly<Record<string, unknown>>;
	  }
	| {
			readonly type: 'WAIT_BATCH';
			readonly commandId: string;
			readonly occurredAt: string;
			readonly stage?: string;
	  }
	| {
			readonly type: 'MARK_LIVE';
			readonly commandId: string;
			readonly occurredAt: string;
			readonly stage?: string;
			readonly externalRefs?: Readonly<Record<string, unknown>>;
	  }
	| {
			readonly type: 'OPEN_ISSUE';
			readonly commandId: string;
			readonly occurredAt: string;
			readonly code: string;
			readonly message: string;
			readonly details?: Readonly<Record<string, unknown>>;
			readonly stage?: string;
	  }
	| {
			readonly type: 'MARK_TAKEN_DOWN';
			readonly commandId: string;
			readonly occurredAt: string;
			readonly stage?: string;
			readonly externalRefs?: Readonly<Record<string, unknown>>;
	  }
	| {
			readonly type: 'SKIP';
			readonly commandId: string;
			readonly occurredAt: string;
			readonly reason?: string;
	  }
	| {
			readonly type: 'RESET_FOR_RETRY';
			readonly commandId: string;
			readonly occurredAt: string;
	  };

export type ChannelDeliveryCommandInput<
	T extends ChannelDeliveryCommand = ChannelDeliveryCommand,
> = T extends unknown ? Omit<T, 'commandId' | 'occurredAt'> : never;

export interface ChannelDeliveryReduction {
	readonly state: ChannelDeliveryState;
	readonly event?: {
		readonly type:
			| 'channel.processing_started'
			| 'channel.waiting_external'
			| 'channel.waiting_batch'
			| 'channel.live'
			| 'channel.issue_opened'
			| 'channel.taken_down'
			| 'channel.skipped'
			| 'channel.retry_reset';
		readonly payload: Readonly<Record<string, unknown>>;
	};
}
