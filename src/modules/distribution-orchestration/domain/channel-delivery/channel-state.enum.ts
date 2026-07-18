/**
 * ChannelState — the COMMON vocabulary for EVERY channel (fixed, small).
 *
 * Deliberately small: the detail of "waiting for whom" (partner/ingest/export/go-live) is NOT a state —
 * it lives in the current process stage's `waitKind` (data). Adding a new wait kind for one DSP
 * = adding a stage in data, NOT a state in this enum → user/reviewer/admin see a consistent set.
 *
 * The interpreter derives state from the current stage's `kind` (INV-C5):
 *   ACTION → DELIVERING · WAIT → WAITING · out of stages → LIVE.
 */
export enum ChannelState {
	PENDING = 'PENDING', // not started
	DELIVERING = 'DELIVERING', // running an ACTION stage (detail in events)
	WAITING = 'WAITING', // at a WAIT stage (waiting externally, has scheduledAt)
	// ── terminal ──
	LIVE = 'LIVE', // ran through the whole distribution process → success
	ISSUES = 'ISSUES', // failed, has a ticket — awaiting retry
	TAKEN_DOWN = 'TAKEN_DOWN',
	SKIPPED = 'SKIPPED',
}

/** Terminal set — used in bubble-up (INV-D4..D7) + interpreter guards. */
export const CHANNEL_TERMINAL_STATES: readonly ChannelState[] = [
	ChannelState.LIVE,
	ChannelState.ISSUES,
	ChannelState.TAKEN_DOWN,
	ChannelState.SKIPPED,
];

export function isChannelTerminal(state: ChannelState): boolean {
	return CHANNEL_TERMINAL_STATES.includes(state);
}
