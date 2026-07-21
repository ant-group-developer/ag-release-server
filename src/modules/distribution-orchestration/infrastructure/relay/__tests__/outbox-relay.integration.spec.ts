import {
	PostgreSqlContainer,
	StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

import { QUEUES } from '../../../application/ports/workflow-engine.port';
import { ChannelDeliveryOrmEntity } from '../../persistence/channel-delivery.orm-entity';
import { DistributionEventOrmEntity } from '../../persistence/distribution-event.orm-entity';
import { DistributionOrmEntity } from '../../persistence/distribution.orm-entity';
import { OutboxEventOrmEntity } from '../../persistence/outbox-event.orm-entity';
import { InMemoryWorkflowAdapter } from '../../workflow/in-memory-workflow.adapter';
import { OutboxRelay } from '../outbox-relay';

/**
 * Integration test — OutboxRelay + Postgres thật (testcontainers).
 *
 * 5 case:
 *   1. Happy path: 3 pending → poll → 3 dispatched, workflow has 3 jobs
 *   2. Schedule mode: entry with runAt → gọi schedule() thay enqueue()
 *   3. Engine failure: enqueue throw → attempts++, entry vẫn pending, 2 entry kia OK
 *   4. Max attempts: entry attempts=10 → bị skip
 *   5. SKIP LOCKED: 2 poll song song → mỗi poll xử lý subset khác nhau
 */

jest.setTimeout(90_000);

let container: StartedPostgreSqlContainer;
let dataSource: DataSource;
let workflow: InMemoryWorkflowAdapter;
let relay: OutboxRelay;

const DIST_ID = '11111111-1111-1111-1111-111111111111';

beforeAll(async () => {
	container = await new PostgreSqlContainer('postgres:16-alpine').start();

	dataSource = new DataSource({
		type: 'postgres',
		host: container.getHost(),
		port: container.getPort(),
		username: container.getUsername(),
		password: container.getPassword(),
		database: container.getDatabase(),
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

	// Insert parent distribution row (FK constraint)
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
});

afterAll(async () => {
	if (dataSource?.isInitialized) await dataSource.destroy();
	if (container) await container.stop();
});

beforeEach(async () => {
	await dataSource.query(
		`TRUNCATE TABLE "outbox_event" RESTART IDENTITY CASCADE`,
	);
	workflow = new InMemoryWorkflowAdapter();
	relay = new OutboxRelay(dataSource, workflow, { emit: () => true } as any);
});

// ── Helpers ──

async function insertOutboxEntry(overrides: {
	jobId: string;
	queue?: string;
	delayMs?: number;
	runAt?: Date | null;
	attempts?: number;
	lastError?: string | null;
	dispatchedAt?: Date | null;
}): Promise<void> {
	await dataSource.query(
		`INSERT INTO "outbox_event"
		 ("distribution_id", "queue", "payload", "job_id", "delay_ms", "run_at",
		  "attempts", "last_error", "dispatched_at")
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
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
			overrides.attempts ?? 0,
			overrides.lastError ?? null,
			overrides.dispatchedAt ?? null,
		],
	);
}

async function getOutboxRow(
	jobId: string,
): Promise<Record<string, unknown> | undefined> {
	const rows: Record<string, unknown>[] = await dataSource.query(
		`SELECT * FROM "outbox_event" WHERE "job_id" = $1`,
		[jobId],
	);
	return rows[0];
}

// ── Tests ──

describe('OutboxRelay (integration)', () => {
	it('Test 1 — happy path: 3 pending entries → poll → 3 dispatched', async () => {
		await insertOutboxEntry({ jobId: 'job-1' });
		await insertOutboxEntry({ jobId: 'job-2', queue: QUEUES.PROVISION_ID });
		await insertOutboxEntry({
			jobId: 'job-3',
			queue: QUEUES.BUILD_PACKAGE,
		});

		const dispatched = await relay.pollAndDispatch();

		expect(dispatched).toBe(3);
		expect(workflow.all).toHaveLength(3);

		// Verify DB: all 3 have dispatched_at set
		for (const jid of ['job-1', 'job-2', 'job-3']) {
			const row = await getOutboxRow(jid);
			expect(row!.dispatched_at).not.toBeNull();
		}
	});

	it('Test 2 — entry with runAt → relay calls schedule() instead of enqueue()', async () => {
		const runAt = new Date('2026-07-20T10:00:00Z');
		await insertOutboxEntry({ jobId: 'sched-1', runAt });

		// Spy on schedule
		const scheduleSpy = jest
			.spyOn(workflow, 'schedule')
			.mockResolvedValue(undefined);

		const dispatched = await relay.pollAndDispatch();

		expect(dispatched).toBe(1);
		expect(scheduleSpy).toHaveBeenCalledTimes(1);
		expect(scheduleSpy).toHaveBeenCalledWith(
			QUEUES.ORCHESTRATE,
			expect.objectContaining({ distributionId: DIST_ID }),
			runAt,
			expect.objectContaining({ jobId: 'sched-1' }),
		);

		const row = await getOutboxRow('sched-1');
		expect(row!.dispatched_at).not.toBeNull();
	});

	it('Test 3 — engine failure: 1 entry throws → attempts++, 2 others dispatched', async () => {
		await insertOutboxEntry({ jobId: 'ok-1' });
		await insertOutboxEntry({
			jobId: 'fail-1',
			queue: QUEUES.PROVISION_ID,
		});
		await insertOutboxEntry({ jobId: 'ok-2', queue: QUEUES.BUILD_PACKAGE });

		// Make engine throw only for 'fail-1'
		const originalEnqueue = workflow.enqueue.bind(workflow);
		jest.spyOn(workflow, 'enqueue').mockImplementation(async (q, p, o) => {
			if (o?.jobId === 'fail-1') {
				throw new Error('Redis connection refused');
			}
			return originalEnqueue(q, p, o);
		});

		const dispatched = await relay.pollAndDispatch();

		expect(dispatched).toBe(2);
		expect(workflow.all).toHaveLength(2);

		// ok entries: dispatched
		expect((await getOutboxRow('ok-1'))!.dispatched_at).not.toBeNull();
		expect((await getOutboxRow('ok-2'))!.dispatched_at).not.toBeNull();

		// fail entry: still pending, attempts incremented
		const failRow = await getOutboxRow('fail-1');
		expect(failRow!.dispatched_at).toBeNull();
		expect(failRow!.attempts).toBe(1);
		expect(failRow!.last_error).toBe('Redis connection refused');
		expect(failRow!.last_attempted_at).not.toBeNull();
	});

	it('Test 4 — max attempts: entry with attempts=10 → skipped by poll', async () => {
		await insertOutboxEntry({ jobId: 'stale-1', attempts: 10 });
		await insertOutboxEntry({ jobId: 'fresh-1' });

		const dispatched = await relay.pollAndDispatch();

		expect(dispatched).toBe(1);
		expect(workflow.all).toHaveLength(1);
		expect(workflow.all[0].opts.jobId).toBe('fresh-1');

		// Stale entry unchanged
		const staleRow = await getOutboxRow('stale-1');
		expect(staleRow!.dispatched_at).toBeNull();
		expect(staleRow!.attempts).toBe(10);
	});

	it('Test 5 — SKIP LOCKED: 2 concurrent polls → each processes non-overlapping subset', async () => {
		// Insert 6 entries
		for (let i = 1; i <= 6; i++) {
			await insertOutboxEntry({ jobId: `concurrent-${i}` });
		}

		// Two separate relay instances sharing same DataSource + workflow
		const relay2 = new OutboxRelay(dataSource, workflow, {
			emit: () => true,
		} as any);

		// Run 2 polls concurrently — each SELECT FOR UPDATE SKIP LOCKED
		// so they won't lock the same rows
		const [d1, d2] = await Promise.all([
			relay.pollAndDispatch(3),
			relay2.pollAndDispatch(3),
		]);

		// Total dispatched = 6 (no overlap, no double-dispatch)
		expect(d1 + d2).toBe(6);

		// All 6 dispatched exactly once
		for (let i = 1; i <= 6; i++) {
			const row = await getOutboxRow(`concurrent-${i}`);
			expect(row!.dispatched_at).not.toBeNull();
		}

		// Workflow has 6 distinct jobs
		expect(workflow.all).toHaveLength(6);
	});

	it('Test 6 — idempotent: second poll after all dispatched → 0', async () => {
		await insertOutboxEntry({ jobId: 'once-1' });

		const first = await relay.pollAndDispatch();
		expect(first).toBe(1);

		const second = await relay.pollAndDispatch();
		expect(second).toBe(0);
	});
});
