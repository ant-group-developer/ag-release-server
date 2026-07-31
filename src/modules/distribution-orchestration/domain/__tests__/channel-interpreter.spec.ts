import { advance, deriveState } from '../channel-delivery/channel-interpreter';
import {
	ChannelEventType,
	ChannelInputType,
} from '../channel-delivery/channel-interpreter.types';
import { ChannelState } from '../channel-delivery/channel-state.enum';
import {
	CI_CLUSTER_INITIAL,
	CI_DEAL_INITIAL,
	CI_GOLIVE,
	CI_TAKEDOWN,
	SPOTIFY_INITIAL,
} from '../channel-delivery/delivery-process.registry';
import {
	InvalidTransitionError,
	InvariantViolationError,
} from '../errors/domain-errors';
import { RetryPolicy } from '../value-objects/retry-policy.vo';

const retry = RetryPolicy.sftpDefault();

describe('deriveState — takedown terminal (process-as-data)', () => {
	it('a finished takedown process derives TAKEN_DOWN, not LIVE', () => {
		expect(deriveState(CI_TAKEDOWN, CI_TAKEDOWN.stages.length)).toBe(
			ChannelState.TAKEN_DOWN,
		);
	});
	it('finishing a takedown emits ChannelTakenDown (not ChannelLive)', () => {
		const res = advance(
			CI_TAKEDOWN,
			{ pos: 1, state: ChannelState.WAITING, retryCount: 0 },
			{ type: ChannelInputType.ARRIVED },
			retry,
		);
		expect(res.state).toBe(ChannelState.TAKEN_DOWN);
		expect(res.emitted).toContain(ChannelEventType.CHANNEL_TAKEN_DOWN);
		expect(res.emitted).not.toContain(ChannelEventType.CHANNEL_LIVE);
	});
});

describe('advance — RESET is only valid from ISSUES', () => {
	it('rejects RESET on a LIVE channel (a done branch stays as-is on retry)', () => {
		expect(() =>
			advance(
				SPOTIFY_INITIAL,
				{ pos: 2, state: ChannelState.LIVE, retryCount: 0 },
				{ type: ChannelInputType.RESET, resetToKey: 'deliver' },
				retry,
			),
		).toThrow(InvalidTransitionError);
	});
});

describe('deriveState (INV-C5)', () => {
	it('derives state from the current stage kind', () => {
		expect(deriveState(SPOTIFY_INITIAL, 0)).toBe(ChannelState.DELIVERING);
		expect(deriveState(SPOTIFY_INITIAL, 1)).toBe(ChannelState.WAITING);
		expect(deriveState(SPOTIFY_INITIAL, 2)).toBe(ChannelState.LIVE);
		expect(deriveState(CI_DEAL_INITIAL, 2)).toBe(ChannelState.DELIVERING);
	});
});

describe('CI cluster process — shared-stages xong → SKIPPED (fan-out hook)', () => {
	// stages: deliver(0 ACTION) → ingest(1 WAIT) → qa(2 GATE) → export(3 WAIT)
	it('chạy hết export (past last stage) derives SKIPPED, không phải LIVE', () => {
		expect(
			deriveState(CI_CLUSTER_INITIAL, CI_CLUSTER_INITIAL.stages.length),
		).toBe(ChannelState.SKIPPED);
	});

	it('export (WAIT) ARRIVED ở stage cuối → SKIPPED + emit CHANNEL_SKIPPED', () => {
		const res = advance(
			CI_CLUSTER_INITIAL,
			{ pos: 3, state: ChannelState.WAITING, retryCount: 0 },
			{ type: ChannelInputType.ARRIVED },
			retry,
		);
		expect(res.state).toBe(ChannelState.SKIPPED);
		expect(res.emitted).toContain(ChannelEventType.CHANNEL_SKIPPED);
		expect(res.emitted).not.toContain(ChannelEventType.CHANNEL_LIVE);
	});

	it('qa GATE_FAIL → ISSUES (cả cụm), pos giữ nguyên', () => {
		const res = advance(
			CI_CLUSTER_INITIAL,
			{ pos: 2, state: ChannelState.DELIVERING, retryCount: 0 },
			{ type: ChannelInputType.GATE_FAIL, ticketRef: 'ticket-cluster' },
			retry,
		);
		expect(res.state).toBe(ChannelState.ISSUES);
		expect(res.pos).toBe(2);
		expect(res.ticketRef).toBe('ticket-cluster');
	});
});

describe('CI go-live watcher — 1 stage golive → LIVE per-DSP', () => {
	it('golive (WAIT) ARRIVED → LIVE', () => {
		const res = advance(
			CI_GOLIVE,
			{ pos: 0, state: ChannelState.WAITING, retryCount: 0 },
			{ type: ChannelInputType.ARRIVED },
			retry,
		);
		expect(res.state).toBe(ChannelState.LIVE);
		expect(res.emitted).toContain(ChannelEventType.CHANNEL_LIVE);
	});

	it('golive WAIT_FAIL (DSP rejected) → ISSUES với ticket', () => {
		const res = advance(
			CI_GOLIVE,
			{ pos: 0, state: ChannelState.WAITING, retryCount: 0 },
			{ type: ChannelInputType.WAIT_FAIL, ticketRef: 'ticket-golive' },
			retry,
		);
		expect(res.state).toBe(ChannelState.ISSUES);
		expect(res.ticketRef).toBe('ticket-golive');
	});
});

describe('advance', () => {
	it('moves ACTION STEP_DONE to the next WAIT stage', () => {
		const result = advance(
			SPOTIFY_INITIAL,
			{ pos: 0, state: ChannelState.DELIVERING, retryCount: 0 },
			{ type: ChannelInputType.STEP_DONE },
			retry,
		);

		expect(result).toEqual({
			pos: 1,
			state: ChannelState.WAITING,
			retryCount: 0,
			emitted: [
				ChannelEventType.STAGE_COMPLETED,
				ChannelEventType.WAITING,
			],
		});
	});

	it('resolves WAIT ARRIVED to LIVE when it reaches the end', () => {
		const result = advance(
			SPOTIFY_INITIAL,
			{ pos: 1, state: ChannelState.WAITING, retryCount: 0 },
			{ type: ChannelInputType.ARRIVED },
			retry,
		);

		expect(result).toEqual({
			pos: 2,
			state: ChannelState.LIVE,
			retryCount: 0,
			emitted: [
				ChannelEventType.WAIT_RESOLVED,
				ChannelEventType.CHANNEL_LIVE,
			],
		});
	});

	it('moves GATE_PASS to the next WAIT stage', () => {
		const result = advance(
			CI_DEAL_INITIAL,
			{ pos: 2, state: ChannelState.DELIVERING, retryCount: 0 },
			{ type: ChannelInputType.GATE_PASS },
			retry,
		);

		expect(result).toEqual({
			pos: 3,
			state: ChannelState.WAITING,
			retryCount: 0,
			emitted: [
				ChannelEventType.STAGE_COMPLETED,
				ChannelEventType.WAITING,
			],
		});
	});

	it('retries retryable ACTION while under the retry limit (INV-C2)', () => {
		const result = advance(
			SPOTIFY_INITIAL,
			{ pos: 0, state: ChannelState.DELIVERING, retryCount: 1 },
			{ type: ChannelInputType.ACTION_FAIL },
			retry,
		);

		expect(result).toEqual({
			pos: 0,
			state: ChannelState.DELIVERING,
			retryCount: 2,
			emitted: [ChannelEventType.ACTION_RETRIED],
		});
	});

	it('moves exhausted ACTION_FAIL to ISSUES with a ticket (INV-C2, INV-C6)', () => {
		const result = advance(
			SPOTIFY_INITIAL,
			{ pos: 0, state: ChannelState.DELIVERING, retryCount: 2 },
			{ type: ChannelInputType.ACTION_FAIL, ticketRef: 'TCK-1' },
			retry,
		);

		expect(result).toEqual({
			pos: 0,
			state: ChannelState.ISSUES,
			retryCount: 3,
			ticketRef: 'TCK-1',
			emitted: [ChannelEventType.CHANNEL_ISSUES],
		});
	});

	it('moves GATE_FAIL to ISSUES with a ticket (INV-C3, INV-C6)', () => {
		const result = advance(
			CI_DEAL_INITIAL,
			{ pos: 2, state: ChannelState.DELIVERING, retryCount: 0 },
			{ type: ChannelInputType.GATE_FAIL, ticketRef: 'TCK-QA' },
			retry,
		);

		expect(result).toMatchObject({
			pos: 2,
			state: ChannelState.ISSUES,
			ticketRef: 'TCK-QA',
			emitted: [ChannelEventType.CHANNEL_ISSUES],
		});
	});

	it('moves WAIT_FAIL to ISSUES with a ticket (INV-C6)', () => {
		const result = advance(
			SPOTIFY_INITIAL,
			{ pos: 1, state: ChannelState.WAITING, retryCount: 0 },
			{ type: ChannelInputType.WAIT_FAIL, ticketRef: 'TCK-PARTNER' },
			retry,
		);

		expect(result).toMatchObject({
			pos: 1,
			state: ChannelState.ISSUES,
			ticketRef: 'TCK-PARTNER',
			emitted: [ChannelEventType.CHANNEL_ISSUES],
		});
	});

	it('rejects inputs that do not match the current stage kind (INV-C1)', () => {
		expect(() =>
			advance(
				SPOTIFY_INITIAL,
				{ pos: 0, state: ChannelState.DELIVERING, retryCount: 0 },
				{ type: ChannelInputType.ARRIVED },
				retry,
			),
		).toThrow(InvalidTransitionError);

		expect(() =>
			advance(
				SPOTIFY_INITIAL,
				{ pos: 1, state: ChannelState.WAITING, retryCount: 0 },
				{ type: ChannelInputType.GATE_FAIL, ticketRef: 'TCK-2' },
				retry,
			),
		).toThrow(InvalidTransitionError);
	});

	it('requires ticketRef for every path into ISSUES (INV-C6)', () => {
		expect(() =>
			advance(
				CI_DEAL_INITIAL,
				{ pos: 2, state: ChannelState.DELIVERING, retryCount: 0 },
				{ type: ChannelInputType.GATE_FAIL },
				retry,
			),
		).toThrow(InvariantViolationError);
	});

	it('resets to a valid current-or-earlier stage (INV-C7)', () => {
		const result = advance(
			CI_DEAL_INITIAL,
			{ pos: 2, state: ChannelState.ISSUES, retryCount: 3 },
			{ type: ChannelInputType.RESET, resetToKey: 'deliver' },
			retry,
		);

		expect(result).toEqual({
			pos: 0,
			state: ChannelState.DELIVERING,
			retryCount: 0,
			emitted: [ChannelEventType.CHANNEL_RESET],
		});
	});

	it('rejects reset to an unknown or future stage (INV-C7)', () => {
		expect(() =>
			advance(
				CI_DEAL_INITIAL,
				{ pos: 2, state: ChannelState.ISSUES, retryCount: 3 },
				{ type: ChannelInputType.RESET, resetToKey: 'missing' },
				retry,
			),
		).toThrow(InvariantViolationError);

		expect(() =>
			advance(
				CI_DEAL_INITIAL,
				{ pos: 2, state: ChannelState.ISSUES, retryCount: 3 },
				{ type: ChannelInputType.RESET, resetToKey: 'export' },
				retry,
			),
		).toThrow(InvariantViolationError);
	});

	it('no-ops repeated non-reset inputs after a terminal state (idempotency)', () => {
		const result = advance(
			SPOTIFY_INITIAL,
			{ pos: 2, state: ChannelState.LIVE, retryCount: 0 },
			{ type: ChannelInputType.ARRIVED },
			retry,
		);

		expect(result).toEqual({
			pos: 2,
			state: ChannelState.LIVE,
			retryCount: 0,
			emitted: [],
		});
	});
});
