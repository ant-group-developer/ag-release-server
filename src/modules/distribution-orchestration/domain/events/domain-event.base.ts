/**
 * DomainEvent — the shape every domain event shares.
 *
 * The aggregate does NOT publish directly — it accumulates events via `pullDomainEvents()`;
 * the application reads them and writes the outbox in the same transaction (phase 3).
 * This is the outbox link: no transition is lost between DB commit and publish.
 */
export interface DomainEvent {
	readonly type: string; // ubiquitous name, past-tense (e.g. 'DistributionSubmitted')
	readonly distributionId: string;
	readonly channelId?: string; // set when it is a channel-level event
	readonly occurredAt: Date; // supplied by the Clock port (test-injectable)
	readonly payload: DomainEventPayload;
}

/**
 * Two-tier level (spec §Domain Events):
 *  - 'milestone': tied to a state transition; the timeline shows it prominently to the user.
 *  - 'progress': a self-loop within one state; detail for admin/dev, hidden from the user.
 *  - 'error': a step/runner failed after exhausting retries; written by StepErrorRecorder
 *             outside the aggregate (no state transition). The read-side projection (phase 3)
 *             can surface these to dev dashboards / admin timeline.
 * The read-side projection (phase 3) filters by `level`.
 */
export type DomainEventLevel = 'milestone' | 'progress' | 'error';

export interface DomainEventPayload {
	readonly level: DomainEventLevel;
	readonly [key: string]: unknown;
}

/** Small helper to build an event uniformly. Keeps factories one-liners. */
export function makeEvent(
	type: string,
	distributionId: string,
	occurredAt: Date,
	payload: DomainEventPayload,
	channelId?: string,
): DomainEvent {
	return { type, distributionId, channelId, occurredAt, payload };
}
