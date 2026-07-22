import { ChannelTopology } from '../../domain/channel-delivery/channel-topology.enum';
import { DistributionState } from '../../domain/distribution/distribution-state.enum';
import { Distribution } from '../../domain/distribution/distribution.aggregate';
import { ExecutionTypeEnum } from '../../domain/value-objects/execution-type.enum';
import { InMemoryDistributionRepository } from '../../infrastructure/test-doubles/in-memory-distribution-repository';
import { InMemoryReviewRepository } from '../../infrastructure/test-doubles/in-memory-review-repository';
import { InMemoryTicketService } from '../../infrastructure/test-doubles/in-memory-ticket-service';
import { InMemoryUnitOfWork } from '../../infrastructure/test-doubles/in-memory-unit-of-work';
import { InMemoryWorkflowAdapter } from '../../infrastructure/workflow/in-memory-workflow.adapter';
import { DistributionCommandService } from '../distribution-command.service';

/**
 * Unit test — retry(): pre-validate scope/state/poison + enqueue RESET_FOR_RETRY.
 */
describe('DistributionCommandService — retry (Khối E)', () => {
	const DIST_ID = '11111111-1111-1111-1111-111111111111';
	const TENANT_ID = '44444444-4444-4444-4444-444444444444';

	let workflow: InMemoryWorkflowAdapter;
	let uow: InMemoryUnitOfWork;
	let repo: InMemoryDistributionRepository;
	let service: DistributionCommandService;

	/** Seed aggregate ở state cho trước với retryCount cho trước. */
	async function seed(
		state: DistributionState,
		retryCount = 0,
	): Promise<void> {
		const dist = Distribution.rehydrate(
			{
				id: DIST_ID,
				releaseId: '22222222-2222-2222-2222-222222222222',
				snapshotId: '33333333-3333-3333-3333-333333333333',
				tenantId: TENANT_ID,
				type: ExecutionTypeEnum.INITIAL_RELEASE,
				correlationId: 'corr-1',
				state,
				retryCount,
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

	beforeEach(() => {
		workflow = new InMemoryWorkflowAdapter();
		uow = new InMemoryUnitOfWork();
		repo = new InMemoryDistributionRepository();
		service = new DistributionCommandService(
			workflow,
			{ createFromRelease: async () => 'snap-x' },
			new InMemoryReviewRepository(),
			new InMemoryTicketService(),
			uow,
			repo,
		);
	});

	it('PARTIALLY_DISTRIBUTED → enqueue RESET_FOR_RETRY (all ISSUES)', async () => {
		await seed(DistributionState.PARTIALLY_DISTRIBUTED);

		await service.retry({ distributionId: DIST_ID });

		const cmd = workflow.all[0].payload.command as any;
		expect(cmd.type).toBe('RESET_FOR_RETRY');
		expect(cmd.scope).toEqual({}); // không channelIds = reset tất cả ISSUES
	});

	it('channelIds → scope mang channelIds', async () => {
		await seed(DistributionState.FAILED);

		await service.retry({
			distributionId: DIST_ID,
			channelIds: ['ch-a', 'ch-b'],
		});

		const cmd = workflow.all[0].payload.command as any;
		expect(cmd.scope).toEqual({ channelIds: ['ch-a', 'ch-b'] });
	});

	it('state không retryable (DELIVERING) → Conflict, không enqueue', async () => {
		await seed(DistributionState.DELIVERING);

		await expect(service.retry({ distributionId: DIST_ID })).rejects.toThrow(
			/not retryable/i,
		);
		expect(workflow.all).toHaveLength(0);
	});

	it('poison (retryCount>=3) → Conflict', async () => {
		await seed(DistributionState.PARTIALLY_DISTRIBUTED, 3);

		await expect(service.retry({ distributionId: DIST_ID })).rejects.toThrow(
			/retry limit|poison/i,
		);
		expect(workflow.all).toHaveLength(0);
	});

	it('tenant ngoài scope → Forbidden', async () => {
		await seed(DistributionState.PARTIALLY_DISTRIBUTED);

		await expect(
			service.retry({
				distributionId: DIST_ID,
				allowedTenantIds: ['other-tenant'],
			}),
		).rejects.toThrow(/tenant scope/i);
		expect(workflow.all).toHaveLength(0);
	});

	it('không tồn tại → NotFound', async () => {
		await expect(
			service.retry({ distributionId: 'nope' }),
		).rejects.toThrow(/not found/i);
	});
});
