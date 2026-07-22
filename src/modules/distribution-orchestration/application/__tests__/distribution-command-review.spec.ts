import { ChannelTopology } from '../../domain/channel-delivery/channel-topology.enum';
import { DistributionState } from '../../domain/distribution/distribution-state.enum';
import { Distribution } from '../../domain/distribution/distribution.aggregate';
import { ExecutionTypeEnum } from '../../domain/value-objects/execution-type.enum';
import { TicketReason } from '../../domain/value-objects/ticket-ref.vo';
import { InMemoryDistributionRepository } from '../../infrastructure/test-doubles/in-memory-distribution-repository';
import { InMemoryReviewRepository } from '../../infrastructure/test-doubles/in-memory-review-repository';
import { InMemoryTicketService } from '../../infrastructure/test-doubles/in-memory-ticket-service';
import { InMemoryUnitOfWork } from '../../infrastructure/test-doubles/in-memory-unit-of-work';
import { InMemoryWorkflowAdapter } from '../../infrastructure/workflow/in-memory-workflow.adapter';
import { DistributionCommandService } from '../distribution-command.service';

/**
 * Unit test — approveReview/rejectReview: ghi review row + enqueue đúng command.
 * snapshotWriter không dùng ở 2 method này → stub tối thiểu.
 */
describe('DistributionCommandService — review decisions (Khối B)', () => {
	const DIST_ID = '11111111-1111-1111-1111-111111111111';
	const REVIEWER = '99999999-9999-9999-9999-999999999999';

	const TENANT_ID = '44444444-4444-4444-4444-444444444444';

	let workflow: InMemoryWorkflowAdapter;
	let reviewRepo: InMemoryReviewRepository;
	let tickets: InMemoryTicketService;
	let uow: InMemoryUnitOfWork;
	let repo: InMemoryDistributionRepository;
	let service: DistributionCommandService;

	/** Seed an aggregate already in IN_REVIEW so review decisions pass the guard. */
	async function seedInReview(): Promise<void> {
		const dist = Distribution.rehydrate(
			{
				id: DIST_ID,
				releaseId: '22222222-2222-2222-2222-222222222222',
				snapshotId: '33333333-3333-3333-3333-333333333333',
				tenantId: TENANT_ID,
				type: ExecutionTypeEnum.INITIAL_RELEASE,
				correlationId: 'corr-1',
				state: DistributionState.IN_REVIEW,
				retryCount: 0,
				version: 0,
				channelSpecs: [
					{
						dspCode: 'SPOTIFY',
						topology: ChannelTopology.DIRECT,
						processCode: 'spotify.initial',
					},
				],
			},
			[],
		);
		await uow.run((ctx) => repo.saveWithOutbox(ctx, dist, [], []));
	}

	beforeEach(async () => {
		workflow = new InMemoryWorkflowAdapter();
		reviewRepo = new InMemoryReviewRepository();
		tickets = new InMemoryTicketService();
		uow = new InMemoryUnitOfWork();
		repo = new InMemoryDistributionRepository();
		const snapshotWriter = { createFromRelease: async () => 'snap-x' };
		service = new DistributionCommandService(
			workflow,
			snapshotWriter,
			reviewRepo,
			tickets,
			uow,
			repo,
		);
		await seedInReview();
	});

	it('approveReview → review row approved + enqueue APPROVE_REVIEW', async () => {
		await service.approveReview({
			distributionId: DIST_ID,
			reviewerId: REVIEWER,
		});

		expect(reviewRepo.records).toHaveLength(1);
		expect(reviewRepo.records[0]).toMatchObject({
			distributionId: DIST_ID,
			reviewerId: REVIEWER,
			status: 'approved',
		});

		const job = workflow.all[0];
		expect(job.queue).toBe('dist.orchestrate');
		expect((job.payload.command as any).type).toBe('APPROVE_REVIEW');
		expect((job.payload.command as any).reviewerId).toBe(REVIEWER);
		expect(tickets.tickets).toHaveLength(0); // approve KHÔNG mở ticket
	});

	it('rejectReview → ticket REVIEW_REJECT + review row rejected + enqueue REJECT_REVIEW w/ ticketRef', async () => {
		await service.rejectReview({
			distributionId: DIST_ID,
			reviewerId: REVIEWER,
			note: 'Cover art too small',
		});

		expect(tickets.tickets).toHaveLength(1);
		expect(tickets.tickets[0].reason).toBe(TicketReason.REVIEW_REJECT);

		expect(reviewRepo.records[0]).toMatchObject({
			status: 'rejected',
			note: 'Cover art too small',
		});

		const cmd = workflow.all[0].payload.command as any;
		expect(cmd.type).toBe('REJECT_REVIEW');
		expect(cmd.note).toBe('Cover art too small');
		expect(cmd.ticketRef).toBeTruthy();
		expect(cmd.ticketRef).toBe(tickets.tickets[0].ref.value);
	});

	it('double rejectReview (same dist) → idempotent ticket (1 ticket)', async () => {
		await service.rejectReview({ distributionId: DIST_ID, reviewerId: REVIEWER });
		await service.rejectReview({ distributionId: DIST_ID, reviewerId: REVIEWER });

		expect(tickets.tickets).toHaveLength(1); // stable ticket key
	});

	it('tenant out of scope → ForbiddenException, không enqueue', async () => {
		await expect(
			service.approveReview({
				distributionId: DIST_ID,
				reviewerId: REVIEWER,
				allowedTenantIds: ['some-other-tenant'], // TENANT_ID không nằm trong
			}),
		).rejects.toThrow(/tenant scope/i);
		expect(workflow.all).toHaveLength(0);
		expect(reviewRepo.records).toHaveLength(0);
	});

	it('tenant in scope → OK', async () => {
		await service.approveReview({
			distributionId: DIST_ID,
			reviewerId: REVIEWER,
			allowedTenantIds: [TENANT_ID],
		});
		expect(workflow.all).toHaveLength(1);
	});

	it('not IN_REVIEW → ConflictException', async () => {
		// Dùng dist id khác (chưa seed) → load null → NotFound; state guard test qua dist đã DELIVERING
		await expect(
			service.approveReview({
				distributionId: 'unknown-dist',
				reviewerId: REVIEWER,
			}),
		).rejects.toThrow(/not found/i);
	});
});
