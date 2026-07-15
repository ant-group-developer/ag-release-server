import { ChannelState } from './channel-state.enum';

/**
 * Contract (types) for the pure interpreter. Contains NO transition logic —
 * the logic lives in `channel-interpreter.ts`. The interpreter is a REDUCER:
 *   (process, current, input) → next
 * It does NOT know distributionId/channelId/time/ports — those are attached at the entity (Step 8).
 */

/** The kind of INPUT the interpreter reacts to (something that happened outside). */
export enum ChannelInputType {
	STEP_DONE = 'STEP_DONE', // an ACTION stage completed
	ARRIVED = 'ARRIVED', // a WAIT stage was woken up (wait finished)
	GATE_PASS = 'GATE_PASS', // GATE check OK
	GATE_FAIL = 'GATE_FAIL', // GATE failed → ISSUES (needs ticketRef)
	WAIT_FAIL = 'WAIT_FAIL', // a WAIT stage failed externally, e.g. DSP reject / export error → ISSUES (needs ticketRef)
	ACTION_FAIL = 'ACTION_FAIL', // one ACTION attempt failed (may retry or → ISSUES)
	RESET = 'RESET', // RETRY: move pos back to a valid stage before the failure point
}

/** One input pushed into the interpreter. */
export interface ChannelInput {
	readonly type: ChannelInputType;
	/** Required when the input leads to ISSUES (INV-C6). The application opens a ticket via the port, then passes the ref. */
	readonly ticketRef?: string;
	/** RESET only: the stage.key to reset to (must be a valid stage before the failure point — INV-C7). */
	readonly resetToKey?: string;
}

/** The current state of a channel that the interpreter reads (never mutates). */
export interface ChannelPosition {
	readonly pos: number; // current stage index (0-based); >= stages.length means done
	readonly state: ChannelState;
	readonly retryCount: number; // number of times the current ACTION has failed
}

/**
 * Marker for the kind of event the interpreter EMITS (the entity in Step 8 builds full DomainEvents).
 * Step 7 (channel.events.ts) will import this enum for its factories — a single source of names.
 */
export enum ChannelEventType {
	CHANNEL_STARTED = 'ChannelStarted', // milestone: PENDING → running the first stage
	STAGE_COMPLETED = 'StageCompleted', // milestone: one ACTION/GATE done, pos++
	WAITING = 'Waiting', // milestone: entered a WAIT (payload carries waitKind)
	WAIT_RESOLVED = 'WaitResolved', // milestone: a WAIT was woken up
	CHANNEL_LIVE = 'ChannelLive', // terminal milestone: ran through the whole process
	CHANNEL_ISSUES = 'ChannelIssues', // terminal milestone: failed (payload carries ticketRef)
	ACTION_RETRIED = 'ActionRetried', // progress: ACTION failed but can still retry
	CHANNEL_RESET = 'ChannelReset', // milestone: RETRY reset back to an earlier stage
	CHANNEL_TAKEN_DOWN = 'ChannelTakenDown', // terminal milestone: takedown process finished
}

/** The interpreter's result (immutable — freshly created, never mutating the input). */
export interface AdvanceResult {
	readonly pos: number;
	readonly state: ChannelState;
	readonly retryCount: number;
	readonly emitted: readonly ChannelEventType[];
	readonly ticketRef?: string; // set when entering ISSUES
}
