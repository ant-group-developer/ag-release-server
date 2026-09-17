import {
	DistributionV2ChannelStatus,
	DistributionV2Status,
	DistributionV2WaitReason,
} from '../../enums/distribution-v2.enum';

export type DistributionV2EventType =
	| 'distribution.submitted'
	| 'distribution.validation_started'
	| 'distribution.validated'
	| 'distribution.validation_failed'
	| 'distribution.review_requested'
	| 'distribution.review_approved'
	| 'distribution.review_rejected'
	| 'distribution.resubmitted'
	| 'distribution.ids_provisioned'
	| 'distribution.package_built'
	| 'distribution.retry_requested'
	| 'distribution.completed'
	| 'channel.processing_started'
	| 'channel.waiting_external'
	| 'channel.waiting_batch'
	| 'channel.live'
	| 'channel.issue_opened'
	| 'channel.taken_down'
	| 'channel.skipped'
	| 'channel.retry_reset';

export interface DistributionV2DomainEvent {
	readonly id: string;
	readonly type: DistributionV2EventType;
	readonly distributionId: string;
	readonly channelId?: string;
	readonly commandId: string;
	readonly occurredAt: string;
	readonly payload: Readonly<Record<string, unknown>>;
}

/**
 * Public domain name used by the application layer.
 *
 * The V2 suffix on the concrete interface keeps it unambiguous next to
 * legacy event contracts while this alias lets callers depend on the domain
 * concept described in the architecture document.
 */
export type DistributionEvent = DistributionV2DomainEvent;

export interface DistributionV2ChannelEventPayload {
	readonly from: DistributionV2ChannelStatus;
	readonly to: DistributionV2ChannelStatus;
	readonly waitReason?: DistributionV2WaitReason;
	readonly scheduledAt?: string;
	readonly error?: Readonly<Record<string, unknown>>;
}

export interface DistributionV2DistributionEventPayload {
	readonly from?: DistributionV2Status;
	readonly to?: DistributionV2Status;
	readonly reason?: string;
	readonly requiresReview?: boolean;
	readonly retryCount?: number;
}
