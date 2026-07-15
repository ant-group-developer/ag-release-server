import { InvariantViolationError } from '../errors/domain-errors';
import {
	DeliveryProcess,
	StageKind,
	validateProcess,
} from './delivery-process';

/**
 * Registry of sample DeliveryProcesses (DATA, not domain code that drives transitions).
 *
 * Phase 2 seeds from real config (reads `Dsp.hasDeal` + `Aggregator.{code,createsDoneFolder,deliveryEmail}`)
 * → picks the code + stages. In phase 1 we hardcode a few samples so the interpreter/tests have input.
 * Adding a DSP with a different rhythm = adding one entry here, NOT touching aggregate/interpreter/ChannelState.
 */

// Spotify (direct) — 1 wait point: upload finishes, then wait for DSP approval
export const SPOTIFY_INITIAL: DeliveryProcess = {
	code: 'spotify.initial',
	stages: [
		{ key: 'deliver', kind: StageKind.ACTION, retryable: true }, // build + upload SFTP
		{ key: 'partner', kind: StageKind.WAIT, waitKind: 'PARTNER' }, // wait for DSP approval 1–5 days
	],
};

// CI with a deal (aggregator) — upload = already imported; 2 wait points + 1 QA gate
export const CI_DEAL_INITIAL: DeliveryProcess = {
	code: 'ci.deal.initial',
	stages: [
		{ key: 'deliver', kind: StageKind.ACTION, retryable: true }, // upload folder + .done = ALREADY imported
		{ key: 'ingest', kind: StageKind.WAIT, waitKind: 'INGEST' }, // wait for CI to process the imported batch
		{ key: 'qa', kind: StageKind.GATE }, // QA flags: pass → continue, fail → ISSUES
		{ key: 'export', kind: StageKind.WAIT, waitKind: 'EXPORT' }, // wait for export (admin panel)
		{ key: 'golive', kind: StageKind.WAIT, waitKind: 'GO_LIVE' }, // wait for DSP go-live
	],
};

// CI takedown — take down the whole cluster; quite different from the two above
export const CI_TAKEDOWN: DeliveryProcess = {
	code: 'ci.takedown',
	stages: [
		{ key: 'request', kind: StageKind.ACTION }, // send the cluster takedown command
		{ key: 'confirm', kind: StageKind.WAIT, waitKind: 'TAKEDOWN' }, // wait for CI to confirm takedown
	],
};

const ALL: readonly DeliveryProcess[] = [
	SPOTIFY_INITIAL,
	CI_DEAL_INITIAL,
	CI_TAKEDOWN,
];

// validate everything at module load — junk processes never reach the interpreter (INV-C8)
const REGISTRY = new Map<string, DeliveryProcess>();
for (const p of ALL) {
	validateProcess(p);
	REGISTRY.set(p.code, p);
}

/** Look up a process by code; missing → throw (bad config, not silent). */
export function getProcess(code: string): DeliveryProcess {
	const p = REGISTRY.get(code);
	if (!p) {
		throw new InvariantViolationError(
			'DeliveryProcessRegistry',
			`unknown process code: ${code}`,
		);
	}
	return p;
}

export function hasProcess(code: string): boolean {
	return REGISTRY.has(code);
}
