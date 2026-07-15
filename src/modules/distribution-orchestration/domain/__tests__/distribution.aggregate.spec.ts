import { ChannelInputType } from '../channel-delivery/channel-interpreter.types';
import { ChannelState } from '../channel-delivery/channel-state.enum';
import { ChannelTopology } from '../channel-delivery/channel-topology.enum';
import { DistributionState } from '../distribution/distribution-state.enum';
import { Distribution } from '../distribution/distribution.aggregate';
import {
	CreateDistributionProps,
	resolveDistributionOutcome,
} from '../distribution/distribution.types';
import {
	InvalidTransitionError,
	RetryLimitExceededError,
} from '../errors/domain-errors';
import { InitialReleasePolicy } from '../policies/initial-release.policy';
import { RetryExecutionPolicy } from '../policies/retry-execution.policy';
import { TakedownPolicy } from '../policies/takedown.policy';
import { Clock } from '../ports/clock.port';
import { ExecutionTypeEnum } from '../value-objects/execution-type.enum';

const clock: Clock = { now: () => new Date('2026-07-15T00:00:00Z') };
const initial = new InitialReleasePolicy();

function props(
	overrides: Partial<CreateDistributionProps> = {},
): CreateDistributionProps {
	return {
		id: 'dist-1',
		releaseId: 'rel-1',
		snapshotId: 'snap-1',
		tenantId: 'tenant-1',
		type: ExecutionTypeEnum.INITIAL_RELEASE,
		correlationId: 'corr-1',
		channelSpecs: [
			{
				dspCode: 'SPOTIFY',
				topology: ChannelTopology.DIRECT,
				processCode: 'spotify.initial',
			},
		],
		...overrides,
	};
}

/** Drive a channel through deliver→partner to LIVE. */
function driveChannelLive(d: Distribution, channelId: string) {
	d.applyChannelInput(channelId, { type: ChannelInputType.STEP_DONE }, clock);
	d.applyChannelInput(channelId, { type: ChannelInputType.ARRIVED }, clock);
}

describe('Distribution aggregate — happy path', () => {
	it('DRAFT → VALIDATING → PROVISIONING → BUILDING → DELIVERING → DISTRIBUTED', () => {
		const d = Distribution.create(props());
		expect(d.state).toBe(DistributionState.DRAFT);

		d.submit(clock);
		expect(d.state).toBe(DistributionState.VALIDATING);

		d.markValidated(initial, false, clock);
		expect(d.state).toBe(DistributionState.PROVISIONING_IDS);

		d.markIdsProvisioned('123456789012', clock);
		expect(d.state).toBe(DistributionState.BUILDING_PACKAGE);

		d.markPackageBuilt('bucket/pkg/', initial, clock);
		expect(d.state).toBe(DistributionState.DELIVERING);
		expect(d.channels).toHaveLength(1);

		driveChannelLive(d, d.channels[0].channelId);
		expect(d.state).toBe(DistributionState.DISTRIBUTED); // INV-D4
	});

	it('accumulates then clears events via pullDomainEvents', () => {
		const d = Distribution.create(props());
		d.submit(clock);
		const events = d.pullDomainEvents();
		expect(events.map((e) => e.type)).toContain('DistributionSubmitted');
		expect(d.pullDomainEvents()).toHaveLength(0); // cleared
	});
});

describe('Distribution aggregate — invariants', () => {
	it('INV-D3: errors never go back to DRAFT (ACTION_REQUIRED + resubmit → VALIDATING)', () => {
		const d = Distribution.create(props());
		d.submit(clock);
		d.flagValidationErrors('TCK-1', ['bad cover'], clock);
		expect(d.state).toBe(DistributionState.ACTION_REQUIRED);

		d.resubmit(clock);
		expect(d.state).toBe(DistributionState.VALIDATING); // not DRAFT
	});

	it('INV-D9: invalid transition throws, does not change state or emit', () => {
		const d = Distribution.create(props());
		expect(() => d.markIdsProvisioned('123456789012', clock)).toThrow(
			InvalidTransitionError,
		);
		expect(d.state).toBe(DistributionState.DRAFT);
		expect(d.pullDomainEvents()).toHaveLength(0);
	});

	it('INV-D10: transitions are idempotent (re-submit at VALIDATING = no-op)', () => {
		const d = Distribution.create(props());
		d.submit(clock);
		d.pullDomainEvents();
		d.submit(clock); // no-op
		expect(d.state).toBe(DistributionState.VALIDATING);
		expect(d.pullDomainEvents()).toHaveLength(0);
	});

	it('INV-D5: ≥1 LIVE and ≥1 ISSUES → PARTIALLY_DISTRIBUTED', () => {
		const d = Distribution.create(
			props({
				channelSpecs: [
					{
						dspCode: 'SPOTIFY',
						topology: ChannelTopology.DIRECT,
						processCode: 'spotify.initial',
					},
					{
						dspCode: 'VEVO',
						topology: ChannelTopology.DIRECT,
						processCode: 'spotify.initial',
					},
				],
			}),
		);
		d.submit(clock);
		d.markValidated(initial, false, clock);
		d.markIdsProvisioned('123456789012', clock);
		d.markPackageBuilt('bucket/pkg/', initial, clock);

		driveChannelLive(d, d.channels[0].channelId);
		// second channel fails delivery permanently
		const ch2 = d.channels[1].channelId;
		d.applyChannelInput(ch2, { type: ChannelInputType.STEP_DONE }, clock);
		d.applyChannelInput(
			ch2,
			{ type: ChannelInputType.WAIT_FAIL, ticketRef: 'TCK-2' },
			clock,
		);

		expect(d.state).toBe(DistributionState.PARTIALLY_DISTRIBUTED);
	});

	it('review branch: tenant requiresReview inserts IN_REVIEW', () => {
		const d = Distribution.create(props());
		d.submit(clock);
		d.markValidated(initial, true, clock);
		expect(d.state).toBe(DistributionState.IN_REVIEW);
		d.approveReview('rev-1', initial, clock);
		expect(d.state).toBe(DistributionState.PROVISIONING_IDS);
	});

	it('INV-D8: resetForRetry needs canRetry + under poison limit', () => {
		const d = Distribution.create(props());
		d.submit(clock);
		d.markValidated(initial, false, clock);
		d.markIdsProvisioned('123456789012', clock);
		d.markPackageBuilt('bucket/pkg/', initial, clock);
		const ch = d.channels[0].channelId;
		d.applyChannelInput(ch, { type: ChannelInputType.STEP_DONE }, clock);
		d.applyChannelInput(
			ch,
			{ type: ChannelInputType.WAIT_FAIL, ticketRef: 'TCK-1' },
			clock,
		);
		expect(d.state).toBe(DistributionState.FAILED);

		// INITIAL policy cannot retry
		expect(() => d.resetForRetry({}, initial, clock)).toThrow();

		// RETRY policy can, and moves back to DELIVERING
		const retry = new RetryExecutionPolicy(initial);
		d.resetForRetry({}, retry, clock);
		expect(d.state).toBe(DistributionState.DELIVERING);
		expect(d.retryCount).toBe(1);
	});

	it('INV-D8: exceeding poison limit throws RetryLimitExceededError', () => {
		const d = Distribution.create(props());
		d.submit(clock);
		d.markValidated(initial, false, clock);
		d.markIdsProvisioned('123456789012', clock);
		d.markPackageBuilt('bucket/pkg/', initial, clock);
		const ch = d.channels[0].channelId;
		const retry = new RetryExecutionPolicy(initial);

		const failThenRetry = () => {
			d.applyChannelInput(
				ch,
				{ type: ChannelInputType.STEP_DONE },
				clock,
			);
			d.applyChannelInput(
				ch,
				{ type: ChannelInputType.WAIT_FAIL, ticketRef: 'TCK' },
				clock,
			);
			d.resetForRetry({}, retry, clock);
		};
		failThenRetry(); // retryCount 1
		failThenRetry(); // retryCount 2
		failThenRetry(); // retryCount 3
		// 4th reset exceeds poison limit
		d.applyChannelInput(ch, { type: ChannelInputType.STEP_DONE }, clock);
		d.applyChannelInput(
			ch,
			{ type: ChannelInputType.WAIT_FAIL, ticketRef: 'TCK' },
			clock,
		);
		expect(() => d.resetForRetry({}, retry, clock)).toThrow(
			RetryLimitExceededError,
		);
	});
});

describe('resolveDistributionOutcome — bubble-up edge cases (INV-D4..D7)', () => {
	it('all SKIPPED (0 LIVE) → FAILED', () => {
		expect(
			resolveDistributionOutcome([ChannelState.SKIPPED, ChannelState.SKIPPED]),
		).toBe(DistributionState.FAILED);
	});
	it('all TAKEN_DOWN → TAKEN_DOWN', () => {
		expect(
			resolveDistributionOutcome([ChannelState.TAKEN_DOWN, ChannelState.TAKEN_DOWN]),
		).toBe(DistributionState.TAKEN_DOWN);
	});
	it('TAKEN_DOWN + SKIPPED → TAKEN_DOWN', () => {
		expect(
			resolveDistributionOutcome([ChannelState.TAKEN_DOWN, ChannelState.SKIPPED]),
		).toBe(DistributionState.TAKEN_DOWN);
	});
	it('LIVE + SKIPPED (no issues) → DISTRIBUTED (INV-D4)', () => {
		expect(
			resolveDistributionOutcome([ChannelState.LIVE, ChannelState.SKIPPED]),
		).toBe(DistributionState.DISTRIBUTED);
	});
	it('still one non-terminal → null (stay DELIVERING)', () => {
		expect(
			resolveDistributionOutcome([ChannelState.LIVE, ChannelState.WAITING]),
		).toBeNull();
	});
});

describe('Distribution aggregate — takedown', () => {
	it('TAKEDOWN policy skips build → DELIVERING → TAKEN_DOWN', () => {
		const d = Distribution.create(
			props({
				type: ExecutionTypeEnum.TAKEDOWN,
				channelSpecs: [
					{
						dspCode: 'CI',
						topology: ChannelTopology.VIA_AGGREGATOR,
						processCode: 'ci.takedown',
						aggregatorCode: 'CI',
					},
				],
			}),
		);
		const takedown = new TakedownPolicy();
		d.submit(clock);
		d.markValidated(takedown, false, clock);
		expect(d.state).toBe(DistributionState.DELIVERING); // skipped provision + build

		const ch = d.channels[0].channelId;
		d.applyChannelInput(ch, { type: ChannelInputType.STEP_DONE }, clock); // request
		d.applyChannelInput(ch, { type: ChannelInputType.ARRIVED }, clock); // confirm → TAKEN_DOWN

		// ci.takedown declares terminalState=TAKEN_DOWN, so the channel ends TAKEN_DOWN
		// and bubble-up resolves the distribution to TAKEN_DOWN (INV-D7).
		expect(d.channels[0].state).toBe(ChannelState.TAKEN_DOWN);
		expect(d.state).toBe(DistributionState.TAKEN_DOWN);
	});
});
