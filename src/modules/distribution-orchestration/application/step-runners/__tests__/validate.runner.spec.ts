import { ChannelDeliverySpec } from '../../../domain/channel-delivery/channel-delivery-spec';
import { ChannelTopology } from '../../../domain/channel-delivery/channel-topology.enum';
import { Distribution } from '../../../domain/distribution/distribution.aggregate';
import { CreateDistributionProps } from '../../../domain/distribution/distribution.types';
import { ExecutionTypeEnum } from '../../../domain/value-objects/execution-type.enum';
import { FixedClock } from '../../../infrastructure/test-doubles/fixed-clock';
import { InMemoryDistributionRepository } from '../../../infrastructure/test-doubles/in-memory-distribution-repository';
import { InMemoryTicketService } from '../../../infrastructure/test-doubles/in-memory-ticket-service';
import { InMemoryUnitOfWork } from '../../../infrastructure/test-doubles/in-memory-unit-of-work';
import {
	ReleaseSnapshot,
	ReleaseSnapshotReader,
} from '../../ports/release-snapshot-reader.port';
import { JobPayload } from '../../ports/workflow-engine.port';
import { ValidateRunner } from '../validate.runner';

/**
 * Unit test ValidateRunner — logic validate + nhánh clean/error/missing-snapshot.
 * Zero I/O: in-memory repo/uow/ticket + stub snapshot reader.
 */
describe('ValidateRunner', () => {
	const DIST_ID = '11111111-1111-1111-1111-111111111111';
	const SNAP_ID = '33333333-3333-3333-3333-333333333333';

	let uow: InMemoryUnitOfWork;
	let repo: InMemoryDistributionRepository;
	let tickets: InMemoryTicketService;
	let snapshotById: Map<string, ReleaseSnapshot | null>;
	let reader: ReleaseSnapshotReader;
	let requiresReviewFlag: boolean;
	let runner: ValidateRunner;

	const specs: ChannelDeliverySpec[] = [
		{
			dspCode: 'SPOTIFY',
			topology: ChannelTopology.DIRECT,
			processCode: 'spotify.initial',
		},
	];

	function createProps(): CreateDistributionProps {
		return {
			id: DIST_ID,
			releaseId: '22222222-2222-2222-2222-222222222222',
			snapshotId: SNAP_ID,
			tenantId: '44444444-4444-4444-4444-444444444444',
			type: ExecutionTypeEnum.INITIAL_RELEASE,
			correlationId: 'corr-1',
			channelSpecs: specs,
		};
	}

	function validSnapshot(): ReleaseSnapshot {
		return {
			id: SNAP_ID,
			releaseId: '22222222-2222-2222-2222-222222222222',
			title: 'My Album',
			labelId: 'label-1',
			primaryGenreId: 'genre-1',
			albumFormatId: 'fmt-1',
			priceTierId: 'tier-1',
			cLineYear: 2026,
			cLineOwner: 'Owner C',
			pLineYear: 2026,
			pLineOwner: 'Owner P',
			releaseDate: '2026-08-01',
			tracks: [{ id: 't1', title: 'Song 1', isrc: 'US-XXX-26-00001' }],
			releaseArtists: [{ id: 'a1', name: 'Artist' }],
			releaseCoverArts: [{ id: 'c1', url: 'gs://cover.jpg' }],
			releaseTerritory: { distributeWorldwide: true },
			payload: {},
		};
	}

	const payload: JobPayload = {
		distributionId: DIST_ID,
		correlationId: 'corr-1',
		key: 'val-key',
	};

	beforeEach(async () => {
		uow = new InMemoryUnitOfWork();
		repo = new InMemoryDistributionRepository();
		tickets = new InMemoryTicketService();
		snapshotById = new Map();
		reader = {
			loadById: async (id: string) => snapshotById.get(id) ?? null,
		};
		requiresReviewFlag = false;
		const tenantReader = {
			requiresManualReview: async () => requiresReviewFlag,
		};
		runner = new ValidateRunner(uow, repo, reader, tickets, tenantReader);

		// Seed a submitted distribution (state VALIDATING)
		const dist = Distribution.create(createProps());
		dist.submit(new FixedClock(new Date('2026-07-21T00:00:00Z')));
		await uow.run((ctx) => repo.saveWithOutbox(ctx, dist, [], []));
	});

	it('clean snapshot → MARK_VALIDATED with requiresReview=false', async () => {
		snapshotById.set(SNAP_ID, validSnapshot());

		const cmd = await runner.run(payload);

		expect(cmd.type).toBe('MARK_VALIDATED');
		expect(cmd).toMatchObject({
			distributionId: DIST_ID,
			requiresReview: false,
		});
		expect(tickets.tickets).toHaveLength(0);
	});

	it('clean snapshot + tenant.requiresManualReview=true → MARK_VALIDATED requiresReview=true', async () => {
		snapshotById.set(SNAP_ID, validSnapshot());
		requiresReviewFlag = true;

		const cmd = await runner.run(payload);

		expect(cmd.type).toBe('MARK_VALIDATED');
		expect(cmd).toMatchObject({ requiresReview: true });
	});

	it('missing required fields → FLAG_VALIDATION_ERRORS + opens VALIDATION ticket', async () => {
		const bad = { ...validSnapshot(), title: null, tracks: [] };
		snapshotById.set(SNAP_ID, bad);

		const cmd = await runner.run(payload);

		expect(cmd.type).toBe('FLAG_VALIDATION_ERRORS');
		if (cmd.type !== 'FLAG_VALIDATION_ERRORS') throw new Error('narrow');
		expect(cmd.errors).toEqual(
			expect.arrayContaining([
				'Release title is required',
				'At least 1 track is required',
			]),
		);
		expect(cmd.ticketRef).toBeTruthy();
		expect(tickets.tickets).toHaveLength(1);
		expect(tickets.tickets[0].reason).toBe('VALIDATION');
	});

	it('territory not worldwide but has selectedCountries → clean', async () => {
		const snap = {
			...validSnapshot(),
			releaseTerritory: {
				distributeWorldwide: false,
				selectedCountries: ['US', 'VN'],
			},
		};
		snapshotById.set(SNAP_ID, snap);

		const cmd = await runner.run(payload);
		expect(cmd.type).toBe('MARK_VALIDATED');
	});

	it('territory neither worldwide nor countries → error', async () => {
		const snap = {
			...validSnapshot(),
			releaseTerritory: {
				distributeWorldwide: false,
				selectedCountries: [],
			},
		};
		snapshotById.set(SNAP_ID, snap);

		const cmd = await runner.run(payload);
		expect(cmd.type).toBe('FLAG_VALIDATION_ERRORS');
	});

	it('track missing ISRC → error', async () => {
		const snap = {
			...validSnapshot(),
			tracks: [{ id: 't1', title: 'Song 1' }],
		};
		snapshotById.set(SNAP_ID, snap);

		const cmd = await runner.run(payload);
		expect(cmd.type).toBe('FLAG_VALIDATION_ERRORS');
		if (cmd.type !== 'FLAG_VALIDATION_ERRORS') throw new Error('narrow');
		expect(cmd.errors).toContain('Track 1: ISRC is required');
	});

	it('snapshot not found → FLAG_VALIDATION_ERRORS + ticket', async () => {
		// snapshotById empty → loadById returns null
		const cmd = await runner.run(payload);

		expect(cmd.type).toBe('FLAG_VALIDATION_ERRORS');
		expect(tickets.tickets).toHaveLength(1);
	});
});
