import { ChannelDeliverySpec } from '../channel-delivery/channel-delivery-spec';
import { ChannelDelivery } from '../channel-delivery/channel-delivery.entity';
import { ChannelInputType } from '../channel-delivery/channel-interpreter.types';
import { ChannelState } from '../channel-delivery/channel-state.enum';
import { ChannelTopology } from '../channel-delivery/channel-topology.enum';
import { Clock } from '../ports/clock.port';

const FIXED = new Date('2026-07-15T10:00:00Z');
const clock: Clock = { now: () => FIXED };

const spotifySpec: ChannelDeliverySpec = {
	dspCode: 'SPOTIFY',
	topology: ChannelTopology.DIRECT,
	processCode: 'spotify.initial',
};

describe('ChannelDelivery entity', () => {
	it('spawns at stage 0 in PENDING', () => {
		const ch = ChannelDelivery.create('ch-1', spotifySpec);
		expect(ch.pos).toBe(0);
		expect(ch.state).toBe(ChannelState.PENDING);
		expect(ch.retryCount).toBe(0);
		expect(ch.isTerminal).toBe(false);
	});

	it('commits the interpreter result and stamps events with channelId + clock time', () => {
		const ch = ChannelDelivery.create('ch-1', spotifySpec);
		// force the channel onto the ACTION stage as if delivering
		const started = ChannelDelivery.rehydrate(spotifySpec, {
			channelId: 'ch-1',
			pos: 0,
			state: ChannelState.DELIVERING,
			retryCount: 0,
		});

		const events = started.apply(
			{ type: ChannelInputType.STEP_DONE },
			clock,
			'dist-1',
		);

		// state committed
		expect(started.pos).toBe(1);
		expect(started.state).toBe(ChannelState.WAITING);

		// events stamped correctly
		expect(events).toHaveLength(2);
		expect(events[0]).toMatchObject({
			type: 'StageCompleted',
			distributionId: 'dist-1',
			channelId: 'ch-1',
			occurredAt: FIXED,
		});
		expect(events[1]).toMatchObject({
			type: 'Waiting',
			channelId: 'ch-1',
			payload: { level: 'milestone', waitKind: 'PARTNER' },
		});

		// prevent accidental noise: keep pointer usage explicit
		expect(ch.pos).toBe(0);
	});

	it('records ticketRef when the channel enters ISSUES', () => {
		const ch = ChannelDelivery.rehydrate(spotifySpec, {
			channelId: 'ch-1',
			pos: 0,
			state: ChannelState.DELIVERING,
			retryCount: 2,
		});

		const events = ch.apply(
			{ type: ChannelInputType.ACTION_FAIL, ticketRef: 'TCK-1' },
			clock,
			'dist-1',
		);

		expect(ch.state).toBe(ChannelState.ISSUES);
		expect(ch.ticketRef).toBe('TCK-1');
		expect(ch.isTerminal).toBe(true);
		expect(events[0]).toMatchObject({
			type: 'ChannelIssues',
			payload: { level: 'milestone', ticketRef: 'TCK-1' },
		});
	});

	it('no-ops after LIVE (idempotency) — returns no events', () => {
		const ch = ChannelDelivery.rehydrate(spotifySpec, {
			channelId: 'ch-1',
			pos: 2,
			state: ChannelState.LIVE,
			retryCount: 0,
		});

		const events = ch.apply(
			{ type: ChannelInputType.ARRIVED },
			clock,
			'dist-1',
		);

		expect(ch.state).toBe(ChannelState.LIVE);
		expect(events).toHaveLength(0);
	});
});
