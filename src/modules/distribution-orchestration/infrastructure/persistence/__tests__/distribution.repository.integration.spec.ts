import {
	PostgreSqlContainer,
	StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

import { OptimisticLockError } from '../../../application/errors/optimistic-lock.error';
import { OutboxEntry } from '../../../application/ports/outbox-entry';
import { QUEUES } from '../../../application/ports/workflow-engine.port';
import { ChannelDeliverySpec } from '../../../domain/channel-delivery/channel-delivery-spec';
import { ChannelState } from '../../../domain/channel-delivery/channel-state.enum';
import { ChannelTopology } from '../../../domain/channel-delivery/channel-topology.enum';
import { DistributionState } from '../../../domain/distribution/distribution-state.enum';
import { Distribution } from '../../../domain/distribution/distribution.aggregate';
import { CreateDistributionProps } from '../../../domain/distribution/distribution.types';
import { InitialReleasePolicy } from '../../../domain/policies/initial-release.policy';
import { Clock } from '../../../domain/ports/clock.port';
import { ExecutionTypeEnum } from '../../../domain/value-objects/execution-type.enum';
import { ChannelDeliveryOrmEntity } from '../channel-delivery.orm-entity';
import { DistributionEventOrmEntity } from '../distribution-event.orm-entity';
import { DistributionOrmEntity } from '../distribution.orm-entity';
import { TypeOrmDistributionRepository } from '../distribution.repository';
import { OutboxEventOrmEntity } from '../outbox-event.orm-entity';
import { TypeOrmUnitOfWork } from '../typeorm-unit-of-work.adapter';

/**
 * Integration Nhịp 2.6 — chạm DB thật (testcontainers Postgres).
 *
 * beforeAll  : spin container → build DataSource → runMigrations
 * beforeEach : TRUNCATE 4 bảng CASCADE (sạch giữa test, giữ schema)
 * afterAll   : destroy + stop
 *
 * 3 case:
 *  1. Round-trip persist — create → submit → saveWithOutbox → assert 4 bảng
 *  2. Rehydrate — save aggregate ở DELIVERING với N channels → load → state+channels+version bảo toàn
 *  3. Optimistic lock — 2 aggregate cùng expectedVersion, lần 2 throw OptimisticLockError
 */

// Testcontainers first-run pull image → nới timeout suite lên 90s
jest.setTimeout(90_000);

// ─── module-level singletons: 1 container/DataSource dùng chung 3 test ───
let container: StartedPostgreSqlContainer;
let dataSource: DataSource;
let uow: TypeOrmUnitOfWork;
let repo: TypeOrmDistributionRepository;

const clock: Clock = { now: () => new Date('2026-07-17T10:00:00Z') };
const policy = new InitialReleasePolicy();

function buildProps(
	overrides: Partial<CreateDistributionProps> = {},
): CreateDistributionProps {
	const specs: ChannelDeliverySpec[] = [
		{
			dspCode: 'SPOTIFY',
			topology: ChannelTopology.DIRECT,
			processCode: 'spotify.initial',
		},
		{
			// DSP thật qua CI (processCode rỗng → spawn gom thành 1 cluster CI, member = APPLE).
			dspCode: 'APPLE',
			topology: ChannelTopology.VIA_AGGREGATOR,
			processCode: '',
			aggregatorCode: 'CI',
			exportMethod: 'CI_DEAL',
			hasDeal: true,
		},
	];
	return {
		id: '11111111-1111-1111-1111-111111111111',
		releaseId: '22222222-2222-2222-2222-222222222222',
		snapshotId: '33333333-3333-3333-3333-333333333333',
		tenantId: '44444444-4444-4444-4444-444444444444',
		type: ExecutionTypeEnum.INITIAL_RELEASE,
		correlationId: '55555555-5555-5555-5555-555555555555',
		channelSpecs: specs,
		...overrides,
	};
}

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
		// synchronize=true — TypeORM tự CREATE TABLE + INDEX từ 4 entity trong module này.
		// KHÔNG dùng runMigrations() vì sẽ chạy toàn bộ migration repo (kể cả cái phụ thuộc
		// bảng "tracks" của module khác). Integration test này scope repo behavior, không
		// verify migration file — migration file test riêng ở CI pipeline chạy full schema.
		// Partial index outbox (WHERE dispatched_at IS NULL) và FK CASCADE không có ở đây;
		// không critical cho 3 case CRUD/optlock của suite này.
		synchronize: true,
		namingStrategy: new SnakeNamingStrategy(),
	});
	await dataSource.initialize();

	uow = new TypeOrmUnitOfWork(dataSource);
	repo = new TypeOrmDistributionRepository();
});

afterAll(async () => {
	if (dataSource?.isInitialized) await dataSource.destroy();
	if (container) await container.stop();
});

beforeEach(async () => {
	// TRUNCATE CASCADE — sạch data, giữ schema đã migrate
	await dataSource.query(
		`TRUNCATE TABLE "distribution", "channel_delivery", "distribution_event", "outbox_event" RESTART IDENTITY CASCADE`,
	);
});

describe('TypeOrmDistributionRepository (integration)', () => {
	it('Test 1 — fresh create → submit → saveWithOutbox persists all 4 tables', async () => {
		// Arrange: fresh aggregate, submit → 1 DistributionSubmitted event
		const dist = Distribution.create(buildProps());
		dist.submit(clock);
		const events = dist.pullDomainEvents();
		expect(events).toHaveLength(1);
		expect(events[0].type).toBe('DistributionSubmitted');

		const outbox: OutboxEntry[] = [
			{
				queue: QUEUES.ORCHESTRATE,
				payload: { command: 'RUN_TURN', distId: dist.id },
				jobId: `${dist.id}:submit`,
			},
		];

		// Act
		await uow.run(async (ctx) => {
			await repo.saveWithOutbox(ctx, dist, events, outbox);
		});

		// Assert: distribution row (version=1 sau INSERT lần đầu)
		const distRows = await dataSource.query(
			`SELECT * FROM "distribution" WHERE id = $1`,
			[dist.id],
		);
		expect(distRows).toHaveLength(1);
		expect(distRows[0].state).toBe(DistributionState.VALIDATING);
		expect(distRows[0].type).toBe(ExecutionTypeEnum.INITIAL_RELEASE);
		expect(distRows[0].version).toBe(1);
		expect(distRows[0].retry_count).toBe(0);

		// channels chưa spawn (VALIDATING chưa vào DELIVERING) → 0 row
		const chanRows = await dataSource.query(
			`SELECT * FROM "channel_delivery" WHERE distribution_id = $1`,
			[dist.id],
		);
		expect(chanRows).toHaveLength(0);

		// distribution_event: 1 row
		const eventRows = await dataSource.query(
			`SELECT * FROM "distribution_event" WHERE distribution_id = $1`,
			[dist.id],
		);
		expect(eventRows).toHaveLength(1);
		expect(eventRows[0].type).toBe('DistributionSubmitted');
		expect(eventRows[0].level).toBe('milestone');
		expect(eventRows[0].payload).toMatchObject({
			channelCount: 2,
			snapshotId: dist.snapshotId,
		});

		// outbox_event: 1 row, dispatched_at NULL
		const outboxRows = await dataSource.query(
			`SELECT * FROM "outbox_event" WHERE distribution_id = $1`,
			[dist.id],
		);
		expect(outboxRows).toHaveLength(1);
		expect(outboxRows[0].queue).toBe(QUEUES.ORCHESTRATE);
		expect(outboxRows[0].job_id).toBe(`${dist.id}:submit`);
		expect(outboxRows[0].dispatched_at).toBeNull();
	});

	it('Test 2 — save then load: state + channels order + version preserved', async () => {
		// Arrange: drive aggregate to DELIVERING (2 channels spawned in order)
		const dist = Distribution.create(buildProps());
		dist.submit(clock);
		dist.markValidated(policy, false, clock); // → PROVISIONING_IDS
		dist.markIdsProvisioned('123456789012', clock); // → BUILDING_PACKAGE
		dist.markPackageBuilt({ SPOTIFY: 'gs://bucket/pkg' }, policy, clock); // → DELIVERING, spawn channels
		expect(dist.state).toBe(DistributionState.DELIVERING);
		expect(dist.channels).toHaveLength(2);

		const events = dist.pullDomainEvents();
		await uow.run((ctx) => repo.saveWithOutbox(ctx, dist, events, []));

		// Act: load lại từ DB
		const loaded = await uow.run((ctx) => repo.load(ctx, dist.id));

		// Assert
		expect(loaded).not.toBeNull();
		expect(loaded!.id).toBe(dist.id);
		expect(loaded!.state).toBe(DistributionState.DELIVERING);
		expect(loaded!.type).toBe(ExecutionTypeEnum.INITIAL_RELEASE);
		expect(loaded!.upc).toBe('123456789012');
		expect(loaded!.packageUris).toEqual({ SPOTIFY: 'gs://bucket/pkg' });
		expect(loaded!.version).toBe(1); // INSERT xong DB=1
		expect(loaded!.channels).toHaveLength(2);
		// Order: SPOTIFY direct (spawnOrder=0), CI cluster (spawnOrder=1).
		expect(loaded!.channels[0].spec.dspCode).toBe('SPOTIFY');
		expect(loaded!.channels[0].isCluster).toBe(false);
		expect(loaded!.channels[0].channelId).toBe(`${dist.id}:ch:0`);

		// channels[1] = CI cluster (gom APPLE). round-trip cluster fields + members.
		const cluster = loaded!.channels[1];
		expect(cluster.channelId).toBe(`${dist.id}:ch:1`);
		expect(cluster.isCluster).toBe(true);
		expect(cluster.spec.processCode).toBe('ci.cluster.initial');
		expect(cluster.spec.aggregatorCode).toBe('CI');
		expect(cluster.members).toEqual([
			{ dspCode: 'APPLE', exportMethod: 'CI_DEAL', hasDeal: true },
		]);
		// Channels ở PENDING sau spawn (chưa apply input)
		expect(loaded!.channels[0].state).toBe(ChannelState.PENDING);
	});

	it('Test 3 — optimistic lock: stale expectedVersion throws OptimisticLockError', async () => {
		// Arrange: 1 aggregate persisted (version 0→1)
		const original = Distribution.create(buildProps());
		original.submit(clock);
		await uow.run((ctx) =>
			repo.saveWithOutbox(ctx, original, original.pullDomainEvents(), []),
		);

		// Load 2 lần → 2 aggregate instance độc lập, cả 2 đang ở version=1
		const [aggA, aggB] = await Promise.all([
			uow.run((ctx) => repo.load(ctx, original.id)),
			uow.run((ctx) => repo.load(ctx, original.id)),
		]);
		expect(aggA!.version).toBe(1);
		expect(aggB!.version).toBe(1);

		// Editor A commit: markValidated → save success (version 1→2 in DB)
		aggA!.markValidated(policy, false, clock);
		await uow.run((ctx) =>
			repo.saveWithOutbox(ctx, aggA!, aggA!.pullDomainEvents(), []),
		);

		// Editor B commit với stale version=1 → throw OptimisticLockError
		aggB!.markValidated(policy, false, clock);
		await expect(
			uow.run((ctx) =>
				repo.saveWithOutbox(ctx, aggB!, aggB!.pullDomainEvents(), []),
			),
		).rejects.toBeInstanceOf(OptimisticLockError);

		// DB vẫn giữ state của A (PROVISIONING_IDS), version=2
		const rows = await dataSource.query(
			`SELECT state, version FROM "distribution" WHERE id = $1`,
			[original.id],
		);
		expect(rows[0].state).toBe(DistributionState.PROVISIONING_IDS);
		expect(rows[0].version).toBe(2);
	});
});
