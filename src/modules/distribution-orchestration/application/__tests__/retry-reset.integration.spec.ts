import { ChannelDelivery } from '../../domain/channel-delivery/channel-delivery.entity';
import { ChannelDeliverySpec } from '../../domain/channel-delivery/channel-delivery-spec';
import { ChannelState } from '../../domain/channel-delivery/channel-state.enum';
import { ChannelTopology } from '../../domain/channel-delivery/channel-topology.enum';
import { Distribution } from '../../domain/distribution/distribution.aggregate';
import { DistributionState } from '../../domain/distribution/distribution-state.enum';
import { ExecutionTypeEnum } from '../../domain/value-objects/execution-type.enum';
import { TicketRef } from '../../domain/value-objects/ticket-ref.vo';
import { FixedClock } from '../../infrastructure/test-doubles/fixed-clock';
import { InMemoryDistributionRepository } from '../../infrastructure/test-doubles/in-memory-distribution-repository';
import { InMemoryTicketService } from '../../infrastructure/test-doubles/in-memory-ticket-service';
import { InMemoryUnitOfWork } from '../../infrastructure/test-doubles/in-memory-unit-of-work';
import { OrchestrateHandler } from '../orchestrate.handler';
import { DefaultPolicyResolver } from '../policy-resolver';

/**
 * Integration (Khối E) — RETRY reset subtree ISSUES → resume + resolve ticket.
 *
 * Real handler + aggregate + interpreter + TicketService. Seed PARTIALLY_DISTRIBUTED:
 *   · ch:0 SPOTIFY LIVE (giữ nguyên — không đụng)
 *   · ch:1 DEEZER ISSUES (có ticketRef) — RESET đưa về stage đầu, resume DELIVERING
 * → RESET_FOR_RETRY: aggregate quay lại DELIVERING, ch:1 rời ISSUES, ticket ch:1 resolved.
 * Chứng minh quyết định #3 (wrap RetryExecutionPolicy) + resolve-ticket-on-reset (nối Khối C).
 */
describe('Integration — RETRY reset → resume + resolve ticket (Khối E)', () => {
	const DIST_ID = '11111111-1111-1111-1111-111111111111';
	const CH0 = `${DIST_ID}:ch:0`; // LIVE
	const CH1 = `${DIST_ID}:ch:1`; // ISSUES + ticket

	const spec = (dspCode: string): ChannelDeliverySpec => ({
		dspCode,
		topology: ChannelTopology.DIRECT,
		processCode: 'spotify.initial', // [deliver ACTION, partner WAIT]
	});

	function makeHarness(ticketService: InMemoryTicketService) {
		const uow = new InMemoryUnitOfWork();
		const repo = new InMemoryDistributionRepository();
		const clock = new FixedClock(new Date('2026-07-21T10:00:00Z'));
		const handler = new OrchestrateHandler(
			uow,
			repo,
			new DefaultPolicyResolver(),
			clock,
			ticketService,
		);
		const load = async () =>
			(await uow.run((ctx) => repo.load(ctx, DIST_ID)))!;
		return { uow, repo, handler, load };
	}

	/** ch:0 LIVE (past last stage), ch:1 ISSUES on 'partner' with a ticketRef. */
	function seedPartial(): Distribution {
		const live = ChannelDelivery.rehydrate(spec('SPOTIFY'), {
			channelId: CH0,
			pos: 2, // past [deliver, partner] → LIVE
			state: ChannelState.LIVE,
			retryCount: 0,
		});
		const issues = ChannelDelivery.rehydrate(spec('DEEZER'), {
			channelId: CH1,
			pos: 1,
			state: ChannelState.ISSUES,
			retryCount: 0,
			ticketRef: 'TICKET-DEEZER-1',
		});
		return Distribution.rehydrate(
			{
				id: DIST_ID,
				releaseId: '22222222-2222-2222-2222-222222222222',
				snapshotId: '33333333-3333-3333-3333-333333333333',
				tenantId: '44444444-4444-4444-4444-444444444444',
				type: ExecutionTypeEnum.INITIAL_RELEASE,
				correlationId: 'corr-retry',
				state: DistributionState.PARTIALLY_DISTRIBUTED,
				upc: '100000000001',
				packageUri: 's3://packages/dist-1.zip',
				retryCount: 0,
				version: 0,
				channelSpecs: [spec('SPOTIFY'), spec('DEEZER')],
			},
			[live, issues],
		);
	}

	it('RESET_FOR_RETRY → DELIVERING, ch:1 rời ISSUES, LIVE giữ nguyên, ticket resolved', async () => {
		const tickets = new InMemoryTicketService();
		// Pre-open ticket cho ch:1 để verify resolve.
		await tickets.open({
			distributionId: DIST_ID,
			channelId: CH1,
			reason: 'PARTNER_FAIL' as any,
			detail: 'DSP DEEZER rejected',
			key: { value: 'seed-key' } as any,
		});
		// Đặt ref khớp seed (InMemory sinh TICKET-1) — resolve theo ref trên entity.
		const seededRef = tickets.tickets[0].ref.value;

		const h = makeHarness(tickets);
		// Gắn ticketRef seed vào channel để handler resolve đúng ref.
		const dist = seedPartial();
		(dist.channels.find((c) => c.channelId === CH1) as any)._ticketRef =
			seededRef;
		await h.uow.run((ctx) => h.repo.saveWithOutbox(ctx, dist, [], []));

		await h.handler.handle({
			type: 'RESET_FOR_RETRY',
			distributionId: DIST_ID,
			key: 'retry-1',
			scope: {}, // tất cả ISSUES
		});

		const after = await h.load();
		expect(after.state).toBe(DistributionState.DELIVERING);
		expect(after.retryCount).toBe(1);

		const ch0 = after.channels.find((c) => c.channelId === CH0)!;
		const ch1 = after.channels.find((c) => c.channelId === CH1)!;
		expect(ch0.state).toBe(ChannelState.LIVE); // giữ nguyên
		expect(ch1.state).not.toBe(ChannelState.ISSUES); // đã reset resume

		// Ticket ch:1 đã resolved (best-effort resolve sau commit).
		const resolved = tickets.tickets.find((t) => t.ref.value === seededRef);
		expect(resolved?.resolved).toBe(true);
	});

	it('scope channelIds rỗng khác undefined: chỉ reset channel được chọn', async () => {
		const tickets = new InMemoryTicketService();
		const h = makeHarness(tickets);
		await h.uow.run((ctx) => h.repo.saveWithOutbox(ctx, seedPartial(), [], []));

		await h.handler.handle({
			type: 'RESET_FOR_RETRY',
			distributionId: DIST_ID,
			key: 'retry-2',
			scope: { channelIds: [CH1] },
		});

		const after = await h.load();
		expect(after.state).toBe(DistributionState.DELIVERING);
		expect(
			after.channels.find((c) => c.channelId === CH0)!.state,
		).toBe(ChannelState.LIVE);
	});
});
