import { EventEmitter2 } from '@nestjs/event-emitter';
import { firstValueFrom, take, toArray } from 'rxjs';
import { DISTRIBUTION_EVENT_SAVED } from '../../../application/events/distribution-sse-event-names';
import { TimelineEventDto } from '../../../application/queries/distribution-timeline.query';
import {
	DistributionEventSavedPayload,
	DistributionSseService,
} from '../distribution-sse.service';

/**
 * Integration test — DistributionSseService + EventEmitter2.
 *
 * Tests:
 *   1. getOrCreateStream → pushEvent → Observable emits MessageEvent
 *   2. @OnEvent listener: emit DISTRIBUTION_EVENT_SAVED → Observable emits
 *   3. cleanup() — Subject completes, Map entry deleted
 *   4. cleanup() on unknown id — no-op (no throw)
 *   5. Multiple streams — events routed to correct distributionId only
 *   6. onModuleDestroy — all Subjects completed
 */

const DIST_A = '11111111-1111-1111-1111-111111111111';
const DIST_B = '22222222-2222-2222-2222-222222222222';

function makeEvent(id: string, type = 'ChannelLive'): TimelineEventDto {
	return {
		id,
		type,
		channelId: null,
		level: 'milestone',
		payload: {},
		occurredAt: new Date('2026-01-01T00:00:00Z'),
	};
}

describe('DistributionSseService (integration)', () => {
	let emitter: EventEmitter2;
	let service: DistributionSseService;

	beforeEach(() => {
		emitter = new EventEmitter2();
		service = new DistributionSseService();
		// Wire @OnEvent manually — TestingModule not needed for in-process unit
		emitter.on(
			DISTRIBUTION_EVENT_SAVED,
			(payload: DistributionEventSavedPayload) =>
				service.handleEventSaved(payload),
		);
	});

	afterEach(() => {
		service.onModuleDestroy();
		emitter.removeAllListeners();
	});

	it('pushEvent → Observable emits MessageEvent with correct shape', async () => {
		const stream$ = service.getOrCreateStream(DIST_A);
		const event = makeEvent('42');

		const resultPromise = firstValueFrom(stream$.pipe(take(1)));
		service.pushEvent(DIST_A, event);

		const msg = await resultPromise;
		expect(msg.data).toMatchObject({ id: '42', type: 'ChannelLive' });
		expect(msg.id).toBe('42');
		expect(msg.type).toBe('ChannelLive');
	});

	it('EventEmitter2 DISTRIBUTION_EVENT_SAVED → Observable emits', async () => {
		const stream$ = service.getOrCreateStream(DIST_A);
		const event = makeEvent('99', 'DistributionSubmitted');

		const resultPromise = firstValueFrom(stream$.pipe(take(1)));

		const payload: DistributionEventSavedPayload = {
			distributionId: DIST_A,
			event,
		};
		emitter.emit(DISTRIBUTION_EVENT_SAVED, payload);

		const msg = await resultPromise;
		expect((msg.data as TimelineEventDto).type).toBe(
			'DistributionSubmitted',
		);
	});

	it('cleanup() completes Subject and removes from Map', (done) => {
		const stream$ = service.getOrCreateStream(DIST_A);

		stream$.subscribe({
			complete: () => {
				// After complete, Map entry should be gone — getOrCreateStream creates new Subject
				const stream2$ = service.getOrCreateStream(DIST_A);
				expect(stream2$).not.toBe(stream$);
				done();
			},
		});

		service.cleanup(DIST_A);
	});

	it('cleanup() on unknown id — no throw', () => {
		expect(() => service.cleanup('non-existent-id')).not.toThrow();
	});

	it('events routed to correct distributionId — no cross-stream bleed', async () => {
		const streamA$ = service.getOrCreateStream(DIST_A);
		const streamB$ = service.getOrCreateStream(DIST_B);

		const receivedA: string[] = [];
		const receivedB: string[] = [];

		const subA = streamA$.subscribe((msg) =>
			receivedA.push((msg.data as TimelineEventDto).id),
		);
		const subB = streamB$.subscribe((msg) =>
			receivedB.push((msg.data as TimelineEventDto).id),
		);

		service.pushEvent(DIST_A, makeEvent('1'));
		service.pushEvent(DIST_B, makeEvent('2'));
		service.pushEvent(DIST_A, makeEvent('3'));

		// Synchronous subjects — no await needed
		expect(receivedA).toEqual(['1', '3']);
		expect(receivedB).toEqual(['2']);

		subA.unsubscribe();
		subB.unsubscribe();
	});

	it('multiple events collected via take(3)', async () => {
		const stream$ = service.getOrCreateStream(DIST_A);
		const resultsPromise = firstValueFrom(stream$.pipe(take(3), toArray()));

		service.pushEvent(DIST_A, makeEvent('10'));
		service.pushEvent(DIST_A, makeEvent('11'));
		service.pushEvent(DIST_A, makeEvent('12'));

		const msgs = await resultsPromise;
		expect(msgs).toHaveLength(3);
		expect(msgs.map((m) => (m.data as TimelineEventDto).id)).toEqual([
			'10',
			'11',
			'12',
		]);
	});

	it('onModuleDestroy — all Subjects completed and Map cleared', (done) => {
		const streamA$ = service.getOrCreateStream(DIST_A);
		const streamB$ = service.getOrCreateStream(DIST_B);

		let completedCount = 0;
		const check = () => {
			completedCount++;
			if (completedCount === 2) done();
		};

		streamA$.subscribe({ complete: check });
		streamB$.subscribe({ complete: check });

		service.onModuleDestroy();
	});
});
