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
 * Integration (Khối B) — REVIEW gate qua handler + aggregate thật.
 *
 * Chứng minh vòng: submit → validate(requiresReview=true) → IN_REVIEW → approve → tiếp
 * (PROVISIONING_IDS); nhánh reject → ACTION_REQUIRED kèm ticketRef + note.
 *
 * Drive bằng command trực tiếp qua OrchestrateHandler (giống orchestrate.e2e), tách khỏi
 * HTTP/RBAC (đã test ở controller/service unit). MARK_VALIDATED{requiresReview:true} mô phỏng
 * ValidateRunner khi tenant bật cờ.
 */
describe('Integration — REVIEW gate (Khối B)', () => {
	const DIST_ID = '11111111-1111-1111-1111-111111111111';
	const REVIEWER = '99999999-9999-9999-9999-999999999999';

	function createProps(): CreateDistributionProps {
		const specs: ChannelDeliverySpec[] = [
			{
				dspCode: 'SPOTIFY',
				topology: ChannelTopology.DIRECT,
				processCode: 'spotify.initial',
			},
		];
		return {
			id: DIST_ID,
			releaseId: '22222222-2222-2222-2222-222222222222',
			snapshotId: '33333333-3333-3333-3333-333333333333',
			tenantId: '44444444-4444-4444-4444-444444444444',
			type: ExecutionTypeEnum.INITIAL_RELEASE,
			correlationId: 'corr-review',
			channelSpecs: specs,
		};
	}

	function makeHarness() {
		const uow = new InMemoryUnitOfWork();
		const repo = new InMemoryDistributionRepository();
		const clock = new FixedClock(new Date('2026-07-21T10:00:00Z'));
		const handler = new OrchestrateHandler(
			uow,
			repo,
			new DefaultPolicyResolver(),
			clock,
		);
		const load = async () =>
			(await uow.run((ctx) => repo.load(ctx, DIST_ID)))!;
		return { handler, load, repo };
	}

	async function driveToInReview(h: ReturnType<typeof makeHarness>) {
		await h.handler.handle({
			type: 'SUBMIT',
			distributionId: DIST_ID,
			key: 'submit-1',
			create: createProps(),
		});
		// tenant.requiresManualReview=true → ValidateRunner trả requiresReview:true
		await h.handler.handle({
			type: 'MARK_VALIDATED',
			distributionId: DIST_ID,
			key: 'val-1',
			requiresReview: true,
		});
	}

	it('submit → IN_REVIEW → approve → PROVISIONING_IDS', async () => {
		const h = makeHarness();
		await driveToInReview(h);

		expect((await h.load()).state).toBe(DistributionState.IN_REVIEW);

		await h.handler.handle({
			type: 'APPROVE_REVIEW',
			distributionId: DIST_ID,
			key: 'approve-1',
			reviewerId: REVIEWER,
		});

		// INITIAL_RELEASE cần provision+build → approve đưa sang PROVISIONING_IDS.
		expect((await h.load()).state).toBe(
			DistributionState.PROVISIONING_IDS,
		);
		const types = h.repo.savedEvents.map((e) => e.type);
		expect(types).toContain('ReviewApproved');
	});

	it('submit → IN_REVIEW → reject (ticket+note) → ACTION_REQUIRED', async () => {
		const h = makeHarness();
		await driveToInReview(h);

		await h.handler.handle({
			type: 'REJECT_REVIEW',
			distributionId: DIST_ID,
			key: 'reject-1',
			reviewerId: REVIEWER,
			ticketRef: 'TICKET-REVIEW-1',
			note: 'Cover art below 3000px',
		});

		expect((await h.load()).state).toBe(
			DistributionState.ACTION_REQUIRED,
		);
		const rejected = h.repo.savedEvents.find(
			(e) => e.type === 'ReviewRejected',
		);
		expect(rejected).toBeDefined();
	});

	it('tenant flag OFF (requiresReview=false) → KHÔNG vào IN_REVIEW', async () => {
		const h = makeHarness();
		await h.handler.handle({
			type: 'SUBMIT',
			distributionId: DIST_ID,
			key: 'submit-2',
			create: createProps(),
		});
		await h.handler.handle({
			type: 'MARK_VALIDATED',
			distributionId: DIST_ID,
			key: 'val-2',
			requiresReview: false,
		});

		expect((await h.load()).state).toBe(
			DistributionState.PROVISIONING_IDS,
		);
	});
});
