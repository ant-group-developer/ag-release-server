import { ChannelEventType } from '../channel-delivery/channel-interpreter.types';
import { DomainEvent, DomainEventLevel, makeEvent } from './domain-event.base';

/**
 * Channel-level domain events. Bridges the interpreter's `ChannelEventType` markers
 * into full `DomainEvent`s (attaching distributionId/channelId/time — supplied at the entity, Step 8).
 *
 * The interpreter stays pure (emits markers only); this is where a marker becomes an event
 * with an id + level. Extra stage context (stageKey/waitKind/ticketRef) rides in the payload.
 */

/** Which markers are milestone vs progress (spec §Domain Events). */
const LEVEL_BY_TYPE: Record<ChannelEventType, DomainEventLevel> = {
	[ChannelEventType.CHANNEL_STARTED]: 'milestone',
	[ChannelEventType.STAGE_COMPLETED]: 'milestone',
	[ChannelEventType.WAITING]: 'milestone',
	[ChannelEventType.WAIT_RESOLVED]: 'milestone',
	[ChannelEventType.CHANNEL_LIVE]: 'milestone',
	[ChannelEventType.CHANNEL_ISSUES]: 'milestone',
	[ChannelEventType.CHANNEL_RESET]: 'milestone',
	[ChannelEventType.ACTION_RETRIED]: 'progress', // self-loop within DELIVERING
	[ChannelEventType.CHANNEL_TAKEN_DOWN]: 'milestone',
	[ChannelEventType.CHANNEL_SKIPPED]: 'milestone', // cluster shared-stages done
};

export interface ChannelEventContext {
	readonly stageKey?: string;
	readonly waitKind?: string;
	readonly ticketRef?: string;
}

/**
 * Build one channel DomainEvent from an interpreter marker.
 * `type` = the marker value (already a past-tense ubiquitous name, e.g. 'ChannelLive').
 */
export function makeChannelEvent(
	marker: ChannelEventType,
	distributionId: string,
	channelId: string,
	at: Date,
	ctx: ChannelEventContext = {},
): DomainEvent {
	return makeEvent(
		marker,
		distributionId,
		at,
		{ level: LEVEL_BY_TYPE[marker], ...ctx },
		channelId,
	);
}
