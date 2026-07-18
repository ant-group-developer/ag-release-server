import { ChannelDeliverySpec } from '../../domain/channel-delivery/channel-delivery-spec';
import { ChannelTopology } from '../../domain/channel-delivery/channel-topology.enum';
import { DistributionState } from '../../domain/distribution/distribution-state.enum';
import { CreateDistributionProps } from '../../domain/distribution/distribution.types';
import { ExecutionTypeEnum } from '../../domain/value-objects/execution-type.enum';
import { FixedClock } from '../../infrastructure/test-doubles/fixed-clock';
import { InMemoryDistributionRepository } from '../../infrastructure/test-doubles/in-memory-distribution-repository';
import { InMemoryUnitOfWork } from '../../infrastructure/test-doubles/in-memory-unit-of-work';
import { OrchestrateHandler } from '../orchestrate.handler';
import { DefaultPolicyResolver } from '../policy-resolver';

/**
 * Pipeline spec — Step 5 mở rộng 8 command → chạy INITIAL_RELEASE end-to-end
 * SUBMIT → MARK_VALIDATED → MARK_IDS_PROVISIONED → MARK_PACKAGE_BUILT →
 * APPLY_CHANNEL_INPUT (STEP_DONE upload) → APPLY_CHANNEL_INPUT (ARRIVED) → LIVE
 * → aggregate bubble-up DISTRIBUTED.
 *
 * Cover:
 *  · state chảy đúng qua từng transition
 *  · outbox chỉ có ở PROVISIONING_IDS + BUILDING_PACKAGE
 *  · review branch (MARK_VALIDATED requiresReview → IN_REVIEW → APPROVE_REVIEW)
 *  · reject + resubmit (VALIDATING → ACTION_REQUIRED → VALIDATING)
 *  · flag validation errors
 *  · idempotent MARK_IDS_PROVISIONED (no event kép)
 */
describe('OrchestrateHandler — Step 5 pipeline commands', () => {
	let uow: InMemoryUnitOfWork;
	let repo: InMemoryDistributionRepository;
	let clock: FixedClock;
	let handler: OrchestrateHandler;

	const DIST_ID = '11111111-1111-1111-1111-111111111111';

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
			snapshotId: '33333333-3333-3333-3333-333333333333',
			tenantId: '44444444-4444-4444-4444-444444444444',
			type: ExecutionTypeEnum.INITIAL_RELEASE,
			correlationId: 'corr-1',
			channelSpecs: specs,
		};
	}

	beforeEach(() => {
		uow = new InMemoryUnitOfWork();
		repo = new InMemoryDistributionRepository();
		clock = new FixedClock(new Date('2026-07-17T10:00:00Z'));
		handler = new OrchestrateHandler(
			uow,
			repo,
			new DefaultPolicyResolver(),
			clock,
		);
	});

	async function loaded() {
		return uow.run((ctx) => repo.load(ctx, DIST_ID));
	}

	// ── happy path partial: SUBMIT → MARK_VALIDATED → MARK_IDS_PROVISIONED ─
	// (state đến BUILDING_PACKAGE; xa hơn cần spawn channel qua rehydrate — xem
	// tech debt Step 5b: aggregate.rehydrate mất `_channelSpecs`, ensureChannelsSpawned
	// no-op sau save+load. Case LIVE + DISTRIBUTED cần add jsonb column channelSpecs
	// vào `distribution` row + đường signature Distribution.rehydrate mới.)
	it('SUBMIT → MARK_VALIDATED → MARK_IDS_PROVISIONED reaches BUILDING_PACKAGE with correct outbox', async () => {
		await handler.handle({
			type: 'SUBMIT',
			distributionId: DIST_ID,
			key: 'k1',
			create: createProps(),
		});
		await handler.handle({
			type: 'MARK_VALIDATED',
			distributionId: DIST_ID,
			key: 'k2',
			requiresReview: false,
		});
		expect((await loaded())!.state).toBe(
			DistributionState.PROVISIONING_IDS,
		);

		await handler.handle({
			type: 'MARK_IDS_PROVISIONED',
			distributionId: DIST_ID,
			key: 'k3',
			upc: '123456789012',
		});
		const d = (await loaded())!;
		expect(d.state).toBe(DistributionState.BUILDING_PACKAGE);
		expect(d.upc).toBe('123456789012');

		// Outbox: 2 job — provision-id (từ turn 2) + build-package (từ turn 3)
		const queues = repo.savedOutbox.map((o) => o.queue);
		expect(queues).toEqual(['dist.provision-id', 'dist.build-package']);
		const eventTypes = repo.savedEvents.map((e) => e.type);
		expect(eventTypes).toEqual([
			'DistributionSubmitted',
			'Validated',
			'IdsProvisioned',
		]);
	});

	// ── review branch ─────────────────────────────────────────────────────
	it('MARK_VALIDATED requiresReview → IN_REVIEW → APPROVE_REVIEW → PROVISIONING_IDS', async () => {
		await handler.handle({
			type: 'SUBMIT',
			distributionId: DIST_ID,
			key: 'k1',
			create: createProps(),
		});
		await handler.handle({
			type: 'MARK_VALIDATED',
			distributionId: DIST_ID,
			key: 'k2',
			requiresReview: true,
		});
		expect((await loaded())!.state).toBe(DistributionState.IN_REVIEW);
		expect(repo.savedOutbox).toHaveLength(0); // IN_REVIEW → chờ reviewer

		await handler.handle({
			type: 'APPROVE_REVIEW',
			distributionId: DIST_ID,
			key: 'k3',
			reviewerId: 'rev-1',
		});
		expect((await loaded())!.state).toBe(
			DistributionState.PROVISIONING_IDS,
		);
		expect(repo.savedOutbox).toHaveLength(1);
		expect(repo.savedOutbox[0].queue).toBe('dist.provision-id');
	});

	// ── review reject + resubmit ──────────────────────────────────────────
	it('REJECT_REVIEW → ACTION_REQUIRED → RESUBMIT → VALIDATING', async () => {
		await handler.handle({
			type: 'SUBMIT',
			distributionId: DIST_ID,
			key: 'k1',
			create: createProps(),
		});
		await handler.handle({
			type: 'MARK_VALIDATED',
			distributionId: DIST_ID,
			key: 'k2',
			requiresReview: true,
		});
		await handler.handle({
			type: 'REJECT_REVIEW',
			distributionId: DIST_ID,
			key: 'k3',
			reviewerId: 'rev-1',
			ticketRef: 'TKT-1',
			note: 'metadata mismatch',
		});
		expect((await loaded())!.state).toBe(DistributionState.ACTION_REQUIRED);

		await handler.handle({
			type: 'RESUBMIT',
			distributionId: DIST_ID,
			key: 'k4',
		});
		expect((await loaded())!.state).toBe(DistributionState.VALIDATING);

		const eventTypes = repo.savedEvents.map((e) => e.type);
		expect(eventTypes).toEqual([
			'DistributionSubmitted',
			'Validated',
			'ReviewRejected',
			'Resubmitted',
		]);
	});

	// ── FLAG_VALIDATION_ERRORS ────────────────────────────────────────────
	it('FLAG_VALIDATION_ERRORS transitions to ACTION_REQUIRED with ticketRef event', async () => {
		await handler.handle({
			type: 'SUBMIT',
			distributionId: DIST_ID,
			key: 'k1',
			create: createProps(),
		});
		await handler.handle({
			type: 'FLAG_VALIDATION_ERRORS',
			distributionId: DIST_ID,
			key: 'k2',
			ticketRef: 'TKT-2',
			errors: ['bad_metadata'],
		});
		expect((await loaded())!.state).toBe(DistributionState.ACTION_REQUIRED);

		const flagged = repo.savedEvents.find(
			(e) => e.type === 'ValidationErrorsFlagged',
		);
		expect(flagged).toBeDefined();
		expect(flagged!.payload).toMatchObject({
			ticketRef: 'TKT-2',
			errors: ['bad_metadata'],
		});
	});

	// ── idempotent MARK_IDS_PROVISIONED ───────────────────────────────────
	it('MARK_IDS_PROVISIONED called twice does not duplicate event (aggregate guard)', async () => {
		await handler.handle({
			type: 'SUBMIT',
			distributionId: DIST_ID,
			key: 'k1',
			create: createProps(),
		});
		await handler.handle({
			type: 'MARK_VALIDATED',
			distributionId: DIST_ID,
			key: 'k2',
			requiresReview: false,
		});
		await handler.handle({
			type: 'MARK_IDS_PROVISIONED',
			distributionId: DIST_ID,
			key: 'k3',
			upc: '123456789012',
		});
		// gọi lại — aggregate.markIdsProvisioned có guard state===BUILDING_PACKAGE → return
		await handler.handle({
			type: 'MARK_IDS_PROVISIONED',
			distributionId: DIST_ID,
			key: 'k3b',
			upc: '999999999999', // upc lần 2 KHÔNG override (guard return trước khi set)
		});

		const idsProvisioned = repo.savedEvents.filter(
			(e) => e.type === 'IdsProvisioned',
		);
		expect(idsProvisioned).toHaveLength(1);
		const d = (await loaded())!;
		expect(d.state).toBe(DistributionState.BUILDING_PACKAGE);
		expect(d.upc).toBe('123456789012'); // giữ UPC đầu
	});
});
