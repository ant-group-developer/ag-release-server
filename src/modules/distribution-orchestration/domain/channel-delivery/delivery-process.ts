import { InvariantViolationError } from '../errors/domain-errors';
import { ChannelState } from './channel-state.enum';

/**
 * StageKind — the kind of one step in a DSP/aggregator flow.
 * The interpreter (Step 6) uses kind to derive ChannelState + decide how to advance.
 */
export enum StageKind {
	ACTION = 'ACTION', // we actively do it (build, upload, export…) → state DELIVERING
	WAIT = 'WAIT', // wait externally (DSP approves, aggregator ingests, DSP goes live) → state WAITING
	GATE = 'GATE', // a pass/fail checkpoint (QA…) → must PASS to move past
}

/**
 * WaitKind — the "waiting for whom" label for UI/projection (WAIT stage only).
 * Left OPEN (string) in the spirit of process-as-data: adding a new wait kind for one DSP
 * = adding a label in data, NOT editing the enum/interpreter. Common values are listed for reference.
 */
export type WaitKind =
	| 'PARTNER'
	| 'INGEST'
	| 'EXPORT'
	| 'GO_LIVE'
	| 'TAKEDOWN'
	| (string & {});

/** One step in a process. Immutable (readonly) — a process is static data, never mutated. */
export interface Stage {
	readonly key: string; // stage id within the process, e.g. 'deliver'|'ingest'|'qa'|'export'
	readonly kind: StageKind;
	readonly waitKind?: WaitKind; // wait label for UI (required when kind=WAIT — INV-C8)
	readonly retryable?: boolean; // whether this ACTION applies a RetryPolicy (e.g. upload ≤3)
}

/** The distribution/takedown flow of one DSP/aggregator, declared as DATA. */
export interface DeliveryProcess {
	readonly code: string; // e.g. 'spotify.initial'|'ci.deal.initial'|'ci.takedown'
	readonly stages: readonly Stage[]; // linear order; interpreter walks pos 0 → end
	/** Terminal state when the process runs to the end. Default LIVE (distribution); takedown → TAKEN_DOWN. */
	readonly terminalState?: ChannelState.LIVE | ChannelState.TAKEN_DOWN;
}

/**
 * validateProcess — INV-C8: stages non-empty; WAIT must have a waitKind; keys unique within the process.
 * Runs at registry seed time to keep junk processes away before the interpreter touches them.
 */
export function validateProcess(p: DeliveryProcess): void {
	const ctx = `DeliveryProcess(${p.code})`;
	if (p.stages.length === 0) {
		throw new InvariantViolationError(ctx, 'empty stages');
	}
	const seen = new Set<string>();
	for (const s of p.stages) {
		if (!s.key.trim()) {
			throw new InvariantViolationError(ctx, 'stage key empty');
		}
		if (seen.has(s.key)) {
			throw new InvariantViolationError(
				ctx,
				`duplicate stage key: ${s.key}`,
			);
		}
		seen.add(s.key);
		if (s.kind === StageKind.WAIT && !s.waitKind) {
			throw new InvariantViolationError(
				ctx,
				`WAIT stage '${s.key}' missing waitKind`,
			);
		}
	}
}
