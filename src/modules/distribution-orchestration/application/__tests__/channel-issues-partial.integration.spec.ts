import { ChannelDelivery } from '../../domain/channel-delivery/channel-delivery.entity';
import { ChannelDeliverySpec } from '../../domain/channel-delivery/channel-delivery-spec';
import { ChannelState } from '../../domain/channel-delivery/channel-state.enum';
import { ChannelTopology } from '../../domain/channel-delivery/channel-topology.enum';
import { Distribution } from '../../domain/distribution/distribution.aggregate';
import { DistributionState } from '../../domain/distribution/distribution-state.enum';
import { ExecutionTypeEnum } from '../../domain/value-objects/execution-type.enum';
import { TicketReason } from '../../domain/value-objects/ticket-ref.vo';
import { FixedClock } from '../../infrastructure/test-doubles/fixed-clock';
import { InMemoryDeliveryStatusReader } from '../../infrastructure/test-doubles/in-memory-delivery-status-reader';
import { InMemoryDistributionRepository } from '../../infrastructure/test-doubles/in-memory-distribution-repository';
import { InMemoryTicketService } from '../../infrastructure/test-doubles/in-memory-ticket-service';
import { InMemoryUnitOfWork } from '../../infrastructure/test-doubles/in-memory-unit-of-work';
import { DistributionCommand } from '../commands/distribution.command';
import { OrchestrateHandler } from '../orchestrate.handler';
import { DefaultPolicyResolver } from '../policy-resolver';
import { StatusSyncRunner } from '../step-runners/status-sync.runner';

/**
 * Integration (Khối C) — channel lỗi → ISSUES → aggregate PARTIALLY_DISTRIBUTED.
 *
 * Wires the REAL handler + aggregate + interpreter + StatusSyncRunner (in-memory ports). Proves
 * the whole Khối C path end-to-end, not one runner in isolation:
 *
 *   2 DIRECT channels seeded at DELIVERING, both WAITING on the 'partner' stage (spotify.initial):
 *     · ch:0 SPOTIFY → DSP live     → runner ARRIVED → channel LIVE
 *     · ch:1 DEEZER  → DSP rejected → runner opens PARTNER_FAIL ticket → WAIT_FAIL → channel ISSUES
 *   → bubble-up: ≥1 LIVE + ≥1 ISSUES ⇒ PARTIALLY_DISTRIBUTED (INV-D5); the ISSUES channel keeps a
 *   ticketRef (INV-C6). Seeding at the WAIT stage isolates the Khối C failure path (no re-driving
 *   the earlier deliver/provision/build steps).
 */
describe('Integration — channel ISSUES → PARTIALLY_DISTRIBUTED (Khối C)', () => {
	const DIST_ID = '11111111-1111-1111-1111-111111111111';
	const UPC = '100000000001';
	const CH0 = `${DIST_ID}:ch:0`; // SPOTIFY → live
	const CH1 = `${DIST_ID}:ch:1`; // DEEZER → rejected

	const spec = (dspCode: string): ChannelDeliverySpec => ({
		dspCode,
		topology: ChannelTopology.DIRECT,
		processCode: 'spotify.initial', // [deliver ACTION, partner WAIT]
	});

	/** A channel already advanced past 'deliver' to the 'partner' WAIT stage (pos 1). */
	const waitingChannel = (channelId: string, dspCode: string) =>
		ChannelDelivery.rehydrate(spec(dspCode), {
			channelId,
			pos: 1,
			state: ChannelState.WAITING,
			retryCount: 0,
		});

	function seedDelivering(): Distribution {
		return Distribution.rehydrate(
			{
				id: DIST_ID,
				releaseId: '22222222-2222-2222-2222-222222222222',
				snapshotId: '33333333-3333-3333-3333-333333333333',
				tenantId: '44444444-4444-4444-4444-444444444444',
				type: ExecutionTypeEnum.INITIAL_RELEASE,
				correlationId: 'corr-partial',
				state: DistributionState.DELIVERING,
				upc: UPC,
				packageUri: 's3://packages/dist-1.zip',
				retryCount: 0,
				version: 0, // fresh → saveWithOutbox INSERTs (→ version 1)
				channelSpecs: [spec('SPOTIFY'), spec('DEEZER')],
			},
			[waitingChannel(CH0, 'SPOTIFY'), waitingChannel(CH1, 'DEEZER')],
		);
	}

	it('one channel live, one DSP-rejected → ticket + ISSUES + PARTIALLY_DISTRIBUTED', async () => {
		const uow = new InMemoryUnitOfWork();
		const repo = new InMemoryDistributionRepository();
		const clock = new FixedClock(new Date('2026-07-21T10:00:00Z'));
		const statusReader = new InMemoryDeliveryStatusReader();
		const ticketService = new InMemoryTicketService();

		const handler = new OrchestrateHandler(
			uow,
			repo,
			new DefaultPolicyResolver(),
			clock,
		);
		const runner = new StatusSyncRunner(uow, repo, statusReader, ticketService);

		// Persist the seeded DELIVERING aggregate.
		await uow.run((ctx) =>
			repo.saveWithOutbox(ctx, seedDelivering(), [], []),
		);

		// DSP outcomes: SPOTIFY live, DEEZER rejected.
		statusReader.setStatus(UPC, 'SPOTIFY', 'live');
		statusReader.setStatus(UPC, 'DEEZER', 'rejected');

		const payload = (channelId: string) => ({
			distributionId: DIST_ID,
			channelId,
			key: `status:${channelId}`,
			correlationId: 'corr-partial',
		});

		// ── ch:0 SPOTIFY → ARRIVED → LIVE (aggregate stays DELIVERING: ch:1 still WAITING) ──
		const cmd0 = (await runner.run(
			payload(CH0),
		)) as DistributionCommand | null;
		expect(cmd0).not.toBeNull();
		await handler.handle(cmd0!);

		let dist = (await uow.run((ctx) => repo.load(ctx, DIST_ID)))!;
		expect(dist.channels.find((c) => c.channelId === CH0)!.state).toBe(
			ChannelState.LIVE,
		);
		expect(dist.state).toBe(DistributionState.DELIVERING);

		// ── ch:1 DEEZER → rejected → ticket PARTNER_FAIL → WAIT_FAIL → ISSUES → bubble-up ──
		const cmd1 = (await runner.run(
			payload(CH1),
		)) as DistributionCommand | null;
		expect(cmd1).not.toBeNull();
		// runner attached the ticketRef it opened (INV-C6).
		expect((cmd1 as any).input.type).toBe('WAIT_FAIL');
		expect((cmd1 as any).input.ticketRef).toBeTruthy();
		await handler.handle(cmd1!);

		dist = (await uow.run((ctx) => repo.load(ctx, DIST_ID)))!;
		const ch1 = dist.channels.find((c) => c.channelId === CH1)!;

		// ── Assertions: ISSUES channel + ticket + partial distribution ──
		expect(ch1.state).toBe(ChannelState.ISSUES);
		expect(ch1.ticketRef).toBeTruthy();
		expect(dist.state).toBe(DistributionState.PARTIALLY_DISTRIBUTED);

		// Exactly one ticket, stable key, PARTNER_FAIL, bound to the ISSUES channel.
		expect(ticketService.tickets).toHaveLength(1);
		const ticket = ticketService.tickets[0];
		expect(ticket.reason).toBe(TicketReason.PARTNER_FAIL);
		expect(ticket.channelId).toBe(CH1);
		expect(ch1.ticketRef).toBe(ticket.ref.value);

		// A PartiallyDistributed event was emitted with the right live/issues counts.
		const partial = repo.savedEvents.find(
			(e) => e.type === 'PartiallyDistributed',
		);
		expect(partial).toBeDefined();
	});

	it('re-running the rejected poll is idempotent → still exactly one ticket', async () => {
		const uow = new InMemoryUnitOfWork();
		const repo = new InMemoryDistributionRepository();
		const clock = new FixedClock(new Date('2026-07-21T10:00:00Z'));
		const statusReader = new InMemoryDeliveryStatusReader();
		const ticketService = new InMemoryTicketService();
		const runner = new StatusSyncRunner(uow, repo, statusReader, ticketService);

		await uow.run((ctx) =>
			repo.saveWithOutbox(ctx, seedDelivering(), [], []),
		);
		statusReader.setStatus(UPC, 'DEEZER', 'rejected');

		const p = {
			distributionId: DIST_ID,
			channelId: CH1,
			key: `status:${CH1}`,
			correlationId: 'corr-partial',
		};

		// Two runner passes on the SAME generation → stable idempotency key → one ticket.
		await runner.run(p);
		await runner.run(p);

		expect(ticketService.tickets).toHaveLength(1);
	});
});
