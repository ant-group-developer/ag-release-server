import { ChannelDeliverySpec } from '../channel-delivery/channel-delivery-spec';
import { ExecutionTypeEnum } from '../value-objects/execution-type.enum';

/**
 * ExecutionPolicy — strategy per ExecutionType. ONE state-machine frame; the policy toggles
 * which milestones run + picks each channel's process. Adding a 5th type = adding a policy,
 * not touching the aggregate (spec §7.3).
 */
export interface ExecutionPolicy {
	readonly type: ExecutionTypeEnum;

	/** INITIAL: true; UPDATE/TAKEDOWN: false (UPDATE still passes PROVISIONING_IDS as a no-op). */
	needsProvisioning(): boolean;

	/** TAKEDOWN: false (uses the takedown process, no build); others true. */
	needsBuildAndUpload(): boolean;

	/** Only RetryExecutionPolicy returns true — gates resetForRetry(). */
	canRetry(): boolean;

	/** Final intent of this execution. */
	terminalIntent(): 'DISTRIBUTED' | 'TAKEN_DOWN';

	/** Picks the registry process code for a channel (e.g. '{dsp}.initial' vs '{dsp}.takedown'). */
	resolveProcessCode(spec: ChannelDeliverySpec): string;

	/** TAKEDOWN only: choose which channels to take down (direct per-DSP; aggregator whole cluster). */
	selectChannelsForTakedown?(
		all: ChannelDeliverySpec[],
	): ChannelDeliverySpec[];
}
