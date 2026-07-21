import {
	EnqueueOptions,
	JobPayload,
	QUEUES,
	QueueName,
	WorkflowEnginePort,
} from '../../../application/ports/workflow-engine.port';
import { DistributionWorkerService } from '../distribution-worker.service';
import { REPOLL_DELAY_MS } from '../repoll-delay.config';

/**
 * Unit test processJob routing — trọng tâm là fix re-poll (runner trả null).
 *
 * Không spin BullMQ Worker thật — gọi thẳng private processJob qua cast, kiểm tra
 * enqueue side-effect qua fake WorkflowEnginePort. Fake RunnerDispatchMap trả giá
 * trị cấu hình được để cover 3 nhánh: orchestrate / command / null(re-poll).
 */
describe('DistributionWorkerService.processJob routing', () => {
	const DIST_ID = '11111111-1111-1111-1111-111111111111';

	interface EnqueueCall {
		queue: QueueName;
		payload: JobPayload;
		opts?: EnqueueOptions;
	}

	let enqueued: EnqueueCall[];
	let engine: WorkflowEnginePort;
	let dispatchResult: unknown;
	let service: DistributionWorkerService;

	function makeService(): DistributionWorkerService {
		enqueued = [];
		engine = {
			enqueue: async (queue, payload, opts) => {
				enqueued.push({ queue, payload, opts });
			},
			schedule: async () => {},
		};
		const dispatchMap = {
			dispatch: async () => dispatchResult,
		} as any;
		// Redis chỉ dùng cho onModuleInit (không gọi trong test này) → stub tối thiểu.
		const fakeRedis = { options: {} } as any;
		return new DistributionWorkerService(fakeRedis, engine, dispatchMap);
	}

	beforeEach(() => {
		service = makeService();
	});

	function processJob(queue: QueueName, payload: JobPayload): Promise<void> {
		return (service as any).processJob(queue, payload);
	}

	const basePayload: JobPayload = {
		distributionId: DIST_ID,
		correlationId: 'corr-1',
		key: 'k1',
	};

	it('orchestrate queue → no enqueue (handler persists state)', async () => {
		dispatchResult = null;
		await processJob(QUEUES.ORCHESTRATE, basePayload);
		expect(enqueued).toHaveLength(0);
	});

	it('runner returns command → enqueue into dist.orchestrate with command', async () => {
		dispatchResult = {
			type: 'MARK_VALIDATED',
			distributionId: DIST_ID,
			key: 'k1:validated',
			requiresReview: false,
		};
		await processJob(QUEUES.VALIDATE, basePayload);

		expect(enqueued).toHaveLength(1);
		expect(enqueued[0].queue).toBe(QUEUES.ORCHESTRATE);
		expect(enqueued[0].payload.command).toMatchObject({
			type: 'MARK_VALIDATED',
		});
	});

	it('runner returns null → RE-POLL same queue with delay + unique jobId', async () => {
		dispatchResult = null;
		await processJob(QUEUES.CI_IMPORT_CHECK, basePayload);

		expect(enqueued).toHaveLength(1);
		const call = enqueued[0];
		expect(call.queue).toBe(QUEUES.CI_IMPORT_CHECK); // re-poll SAME queue
		expect(call.opts?.delayMs).toBe(REPOLL_DELAY_MS(QUEUES.CI_IMPORT_CHECK));
		expect(call.payload.pollAttempt).toBe(1);
		expect(call.opts?.jobId).toContain('poll-1');
	});

	it('re-poll increments pollAttempt → jobId changes each poll (no dedupe stall)', async () => {
		dispatchResult = null;
		await processJob(QUEUES.CI_IMPORT_CHECK, {
			...basePayload,
			pollAttempt: 2,
		});

		expect(enqueued[0].payload.pollAttempt).toBe(3);
		expect(enqueued[0].opts?.jobId).toContain('poll-3');
	});
});
