import { ChannelDeliverySpec } from '../../domain/channel-delivery/channel-delivery-spec';
import { ChannelTopology } from '../../domain/channel-delivery/channel-topology.enum';
import { DistributionState } from '../../domain/distribution/distribution-state.enum';
import { CreateDistributionProps } from '../../domain/distribution/distribution.types';
import { ExecutionTypeEnum } from '../../domain/value-objects/execution-type.enum';
import { FixedClock } from '../../infrastructure/test-doubles/fixed-clock';
import { InMemoryDistributionRepository } from '../../infrastructure/test-doubles/in-memory-distribution-repository';
import { InMemoryUnitOfWork } from '../../infrastructure/test-doubles/in-memory-unit-of-work';
import { AggregateNotFoundError } from '../errors/aggregate-not-found.error';
import { OptimisticLockError } from '../errors/optimistic-lock.error';
import { OrchestrateHandler } from '../orchestrate.handler';
import { DefaultPolicyResolver } from '../policy-resolver';

/**
 * Test spec cho OrchestrateHandler — vòng lặp 1 turn end-to-end in-memory.
 *
 * Test double: InMemoryUnitOfWork (no-tx) + InMemoryDistributionRepository (optlock mô phỏng)
 *   + FixedClock + DefaultPolicyResolver. Zero I/O.
 *
 * Case:
 *  1. SUBMIT fresh → aggregate persist với version=1, state=VALIDATING, 1 event, 0 outbox.
 *  2. SUBMIT rồi MARK_VALIDATED → state PROVISIONING_IDS, outbox 1 job dist.provision-id.
 *  3. SUBMIT idempotent 2 lần (aggregate guard) → không throw, event/outbox không nhân đôi.
 *  4. MARK_VALIDATED không có aggregate → AggregateNotFoundError.
 *  5. Optlock: A + B cùng load, A save trước, B save sau → OptimisticLockError.
 *  6. jobId deterministic — tránh trùng khi enqueue lặp.
 */
describe('OrchestrateHandler', () => {
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

	// ── 1. SUBMIT fresh ────────────────────────────────────────────────────
	it('SUBMIT on fresh id creates aggregate, persists submit event, no outbox', async () => {
		await handler.handle({
			type: 'SUBMIT',
			distributionId: DIST_ID,
			key: 'sub-k1',
			create: createProps(),
		});

		expect(repo.getVersion(DIST_ID)).toBe(1);
		expect(repo.savedEvents).toHaveLength(1);
		expect(repo.savedEvents[0].type).toBe('DistributionSubmitted');
		// state VALIDATING → không outbox (đợi external validator)
		expect(repo.savedOutbox).toHaveLength(0);

		// Load lại → state VALIDATING đúng
		const loaded = await uow.run((ctx) => repo.load(ctx, DIST_ID));
		expect(loaded!.state).toBe(DistributionState.VALIDATING);
	});

	// ── 2. MARK_VALIDATED sau SUBMIT: VALIDATING → PROVISIONING_IDS ────────
	it('MARK_VALIDATED transitions to PROVISIONING_IDS + enqueues dist.provision-id', async () => {
		await handler.handle({
			type: 'SUBMIT',
			distributionId: DIST_ID,
			key: 'sub-k1',
			create: createProps(),
		});
		await handler.handle({
			type: 'MARK_VALIDATED',
			distributionId: DIST_ID,
			key: 'val-k1',
			requiresReview: false,
		});

		expect(repo.getVersion(DIST_ID)).toBe(2);
		// events: DistributionSubmitted + Validated
		expect(repo.savedEvents.map((e) => e.type)).toEqual([
			'DistributionSubmitted',
			'Validated',
		]);

		// outbox: 1 job vào dist.provision-id
		expect(repo.savedOutbox).toHaveLength(1);
		expect(repo.savedOutbox[0].queue).toBe('dist.provision-id');
		expect(repo.savedOutbox[0].jobId).toBe(
			`${DIST_ID}:${DistributionState.PROVISIONING_IDS}:val-k1`,
		);
		expect(repo.savedOutbox[0].payload).toMatchObject({
			distributionId: DIST_ID,
			correlationId: 'corr-1',
			key: 'val-k1',
		});
	});

	// ── 3. SUBMIT idempotent (aggregate guard) ─────────────────────────────
	it('SUBMIT called twice does not duplicate event (aggregate idempotent guard)', async () => {
		// Turn 1: SUBMIT fresh → INSERT version=1
		await handler.handle({
			type: 'SUBMIT',
			distributionId: DIST_ID,
			key: 'sub-k1',
			create: createProps(),
		});

		// Turn 2: SUBMIT LẦN 2 — repo trả aggregate ở VALIDATING (đã submit),
		// aggregate.submit() guard: state === VALIDATING → return no-op.
		// pullDomainEvents() = [] → save UPDATE version=1→2 với 0 event, 0 outbox.
		await handler.handle({
			type: 'SUBMIT',
			distributionId: DIST_ID,
			key: 'sub-k2',
			create: createProps(),
		});

		// events: chỉ 1 lần DistributionSubmitted (turn 2 aggregate guard bỏ qua)
		expect(repo.savedEvents).toHaveLength(1);
		expect(repo.savedEvents[0].type).toBe('DistributionSubmitted');
		// outbox: 0 (state vẫn VALIDATING)
		expect(repo.savedOutbox).toHaveLength(0);
	});

	// ── 4. MARK_VALIDATED không có aggregate → AggregateNotFoundError ──────
	it('MARK_VALIDATED without prior SUBMIT throws AggregateNotFoundError', async () => {
		await expect(
			handler.handle({
				type: 'MARK_VALIDATED',
				distributionId: DIST_ID,
				key: 'val-k1',
				requiresReview: false,
			}),
		).rejects.toBeInstanceOf(AggregateNotFoundError);

		// Không side-effect nào persist
		expect(repo.getVersion(DIST_ID)).toBe(0);
		expect(repo.savedEvents).toHaveLength(0);
		expect(repo.savedOutbox).toHaveLength(0);
	});

	// ── 5. Optlock: 2 handler race → 1 thắng, 1 throw ─────────────────────
	it('concurrent MARK_VALIDATED loses race with OptimisticLockError', async () => {
		// Setup: SUBMIT xong (version DB = 1)
		await handler.handle({
			type: 'SUBMIT',
			distributionId: DIST_ID,
			key: 'sub-k1',
			create: createProps(),
		});
		expect(repo.getVersion(DIST_ID)).toBe(1);

		// Load 2 aggregate độc lập cùng version=1
		const [aggA, aggB] = await Promise.all([
			uow.run((ctx) => repo.load(ctx, DIST_ID)),
			uow.run((ctx) => repo.load(ctx, DIST_ID)),
		]);
		expect(aggA!.version).toBe(1);
		expect(aggB!.version).toBe(1);

		// A markValidated + save trước → DB version 1→2
		aggA!.markValidated(
			new DefaultPolicyResolver().resolve(aggA!.type),
			false,
			clock,
		);
		await uow.run((ctx) =>
			repo.saveWithOutbox(ctx, aggA!, aggA!.pullDomainEvents(), []),
		);
		expect(repo.getVersion(DIST_ID)).toBe(2);

		// B markValidated + save với stale version=1 → throw OptimisticLockError
		aggB!.markValidated(
			new DefaultPolicyResolver().resolve(aggB!.type),
			false,
			clock,
		);
		await expect(
			uow.run((ctx) =>
				repo.saveWithOutbox(ctx, aggB!, aggB!.pullDomainEvents(), []),
			),
		).rejects.toBeInstanceOf(OptimisticLockError);

		// DB vẫn version=2 (state của A)
		expect(repo.getVersion(DIST_ID)).toBe(2);
	});

	// ── 6. jobId deterministic → chống trùng ở tầng outbox ────────────────
	it('outbox jobId is deterministic across handler runs (idempotency key)', async () => {
		await handler.handle({
			type: 'SUBMIT',
			distributionId: DIST_ID,
			key: 'sub-k1',
			create: createProps(),
		});
		await handler.handle({
			type: 'MARK_VALIDATED',
			distributionId: DIST_ID,
			key: 'val-fixed-key',
			requiresReview: false,
		});

		const jobIds = repo.savedOutbox.map((o) => o.jobId);
		// jobId cấu tạo: `${distId}:${state}:${key}` → cùng inputs → cùng jobId
		expect(jobIds).toEqual([
			`${DIST_ID}:${DistributionState.PROVISIONING_IDS}:val-fixed-key`,
		]);
	});
});
