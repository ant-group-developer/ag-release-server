import {
	PostgreSqlContainer,
	StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { ConnectionOptions, Queue } from 'bullmq';
import Redis from 'ioredis';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

import { QUEUES } from '../../../application/ports/workflow-engine.port';
import { ChannelDeliveryOrmEntity } from '../../persistence/channel-delivery.orm-entity';
import { DistributionEventOrmEntity } from '../../persistence/distribution-event.orm-entity';
import { DistributionOrmEntity } from '../../persistence/distribution.orm-entity';
import { OutboxEventOrmEntity } from '../../persistence/outbox-event.orm-entity';
import { OutboxRelay } from '../../relay/outbox-relay';
import { BullMqWorkflowAdapter } from '../bullmq-workflow.adapter';

/**
 * E2E integration — OutboxRelay → BullMqWorkflowAdapter → Redis thật.
 *
 * Chứng minh toàn bộ pipeline write-side hoạt động:
 *   1. Outbox entries ghi trong DB (giả handler đã persist)
 *   2. OutboxRelay poll → dispatch qua BullMqWorkflowAdapter
 *   3. Jobs thật sự land trong Redis BullMQ queue
 *
 * Infra: testcontainers Postgres 16 + Redis 7.
 * KHÔNG có Worker (consumer) — Phase 2 chỉ chứng minh enqueue.
 *
 * 4 cases:
 *   1. Happy path: 2 outbox entries → relay → 2 jobs in Redis
 *   2. Entry with delayMs → job has delay
 *   3. Duplicate jobId → still 1 job (BullMQ dedupe)
 *   4. Entry with runAt → schedule() → job has calculated delay
 */

jest.setTimeout(120_000);

let pgContainer: StartedPostgreSqlContainer;
let redisContainer: StartedTestContainer;
let dataSource: DataSource;
let redis: Redis;
let redisOpts: ConnectionOptions;
let adapter: BullMqWorkflowAdapter;
let relay: OutboxRelay;

const DIST_ID = '11111111-1111-1111-1111-111111111111';

beforeAll(async () => {
	// Spin up Postgres + Redis containers in parallel
	[pgContainer, redisContainer] = await Promise.all([
		new PostgreSqlContainer('postgres:16-alpine').start(),
		new GenericContainer('redis:7-alpine').withExposedPorts(6379).start(),
	]);

	// Postgres DataSource
	dataSource = new DataSource({
		type: 'postgres',
		host: pgContainer.getHost(),
		port: pgContainer.getPort(),
		username: pgContainer.getUsername(),
		password: pgContainer.getPassword(),
		database: pgContainer.getDatabase(),
		entities: [
			DistributionOrmEntity,
			ChannelDeliveryOrmEntity,
			DistributionEventOrmEntity,
			OutboxEventOrmEntity,
		],
		synchronize: true,
		namingStrategy: new SnakeNamingStrategy(),
	});
	await dataSource.initialize();

	// Parent distribution row (FK)
	await dataSource.query(
		`INSERT INTO "distribution"
		 ("id", "release_id", "snapshot_id", "tenant_id", "type", "correlation_id",
		  "state", "retry_count", "version", "channel_specs")
		 VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 1, '[]'::jsonb)`,
		[
			DIST_ID,
			'22222222-2222-2222-2222-222222222222',
			'33333333-3333-3333-3333-333333333333',
			'44444444-4444-4444-4444-444444444444',
			'INITIAL_RELEASE',
			'55555555-5555-5555-5555-555555555555',
			'VALIDATING',
		],
	);

	// Redis connection
	const redisHost = redisContainer.getHost();
	const redisPort = redisContainer.getMappedPort(6379);
	redis = new Redis({
		host: redisHost,
		port: redisPort,
		maxRetriesPerRequest: null,
	});
	redisOpts = {
		host: redisHost,
		port: redisPort,
		maxRetriesPerRequest: null,
	};

	// Wire: adapter + relay
	adapter = new BullMqWorkflowAdapter(redis);
	relay = new OutboxRelay(dataSource, adapter, { emit: () => true } as any);
});

afterAll(async () => {
	await adapter.onModuleDestroy();
	redis.disconnect();
	if (dataSource?.isInitialized) await dataSource.destroy();
	if (redisContainer) await redisContainer.stop();
	if (pgContainer) await pgContainer.stop();
});

beforeEach(async () => {
	await dataSource.query(
		`TRUNCATE TABLE "outbox_event" RESTART IDENTITY CASCADE`,
	);
	// Flush Redis between tests
	await redis.flushall();
});

// ── Helpers ──

async function insertOutboxEntry(overrides: {
	jobId: string;
	queue?: string;
	delayMs?: number;
	runAt?: Date | null;
}): Promise<void> {
	await dataSource.query(
		`INSERT INTO "outbox_event"
		 ("distribution_id", "queue", "payload", "job_id", "delay_ms", "run_at",
		  "attempts", "dispatched_at")
		 VALUES ($1, $2, $3, $4, $5, $6, 0, NULL)`,
		[
			DIST_ID,
			overrides.queue ?? QUEUES.ORCHESTRATE,
			JSON.stringify({
				distributionId: DIST_ID,
				correlationId: '55555555-5555-5555-5555-555555555555',
				key: overrides.jobId,
			}),
			overrides.jobId,
			overrides.delayMs ?? 0,
			overrides.runAt ?? null,
		],
	);
}

/** Read jobs from a BullMQ queue via a temporary Queue instance. */
async function getJobsFromQueue(
	queueName: string,
): Promise<{ id: string | undefined; data: unknown; delay: number }[]> {
	const q = new Queue(queueName, {
		connection: redisOpts,
	});
	const jobs = await q.getJobs([
		'waiting',
		'delayed',
		'active',
		'completed',
		'failed',
	]);
	const result = jobs.map((j) => ({
		id: j.id,
		data: j.data,
		delay: j.opts?.delay ?? 0,
	}));
	await q.close();
	return result;
}

// ── Tests ──

describe('BullMQ E2E — OutboxRelay → BullMqWorkflowAdapter → Redis', () => {
	it('Test 1 — 2 outbox entries → relay dispatch → 2 jobs in Redis queues', async () => {
		await insertOutboxEntry({
			jobId: 'e2e-job-1',
			queue: QUEUES.ORCHESTRATE,
		});
		await insertOutboxEntry({
			jobId: 'e2e-job-2',
			queue: QUEUES.PROVISION_ID,
		});

		const dispatched = await relay.pollAndDispatch();
		expect(dispatched).toBe(2);

		// Verify jobs in Redis
		const orchestrateJobs = await getJobsFromQueue(QUEUES.ORCHESTRATE);
		expect(orchestrateJobs).toHaveLength(1);
		expect(orchestrateJobs[0].id).toBe('e2e-job-1'); // sanitized: no colon in this case
		expect(orchestrateJobs[0].data).toMatchObject({
			distributionId: DIST_ID,
		});

		const provisionJobs = await getJobsFromQueue(QUEUES.PROVISION_ID);
		expect(provisionJobs).toHaveLength(1);
		expect(provisionJobs[0].id).toBe('e2e-job-2');
	});

	it('Test 2 — entry with delayMs → job has delay set', async () => {
		await insertOutboxEntry({
			jobId: 'delay-job',
			queue: QUEUES.BUILD_PACKAGE,
			delayMs: 30_000,
		});

		await relay.pollAndDispatch();

		const jobs = await getJobsFromQueue(QUEUES.BUILD_PACKAGE);
		expect(jobs).toHaveLength(1);
		expect(jobs[0].delay).toBe(30_000);
	});

	it('Test 3 — duplicate jobId → BullMQ dedupe → still 1 job', async () => {
		// Enqueue same jobId twice directly through adapter
		const payload = {
			distributionId: DIST_ID,
			correlationId: '55555555-5555-5555-5555-555555555555',
			key: 'dedup-key',
		};
		await adapter.enqueue(QUEUES.ORCHESTRATE, payload, {
			jobId: 'dedup-test',
		});
		await adapter.enqueue(QUEUES.ORCHESTRATE, payload, {
			jobId: 'dedup-test',
		});

		const jobs = await getJobsFromQueue(QUEUES.ORCHESTRATE);
		expect(jobs).toHaveLength(1);
	});

	it('Test 4 — jobId with colons → sanitized (: → -) in Redis', async () => {
		// This simulates the real handler jobId format: ${distId}:${state}:${key}
		await insertOutboxEntry({
			jobId: `${DIST_ID}:PROVISIONING_IDS:key-1`,
			queue: QUEUES.PROVISION_ID,
		});

		await relay.pollAndDispatch();

		const jobs = await getJobsFromQueue(QUEUES.PROVISION_ID);
		expect(jobs).toHaveLength(1);
		// Colons replaced with dashes by sanitizeJobId
		expect(jobs[0].id).toBe(
			`${DIST_ID.replace(/:/g, '-')}-PROVISIONING_IDS-key-1`,
		);
	});

	it('Test 5 — entry with runAt → schedule() → job has calculated delay', async () => {
		const runAt = new Date(Date.now() + 60_000); // 1 minute from now
		await insertOutboxEntry({
			jobId: 'sched-job',
			queue: QUEUES.CI_IMPORT_CHECK,
			runAt,
		});

		await relay.pollAndDispatch();

		const jobs = await getJobsFromQueue(QUEUES.CI_IMPORT_CHECK);
		expect(jobs).toHaveLength(1);
		// Delay should be approximately 60s (± a few seconds for test execution time)
		expect(jobs[0].delay).toBeGreaterThan(50_000);
		expect(jobs[0].delay).toBeLessThanOrEqual(61_000);
	});
});
