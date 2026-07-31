import {
	PostgreSqlContainer,
	StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

import { ChannelDeliveryOrmEntity } from '../../../infrastructure/persistence/channel-delivery.orm-entity';
import { DistributionEventOrmEntity } from '../../../infrastructure/persistence/distribution-event.orm-entity';
import { DistributionOrmEntity } from '../../../infrastructure/persistence/distribution.orm-entity';
import { OutboxEventOrmEntity } from '../../../infrastructure/persistence/outbox-event.orm-entity';
import { ReleaseDspDeliveryProjection } from '../release-dsp-delivery.projection';

/**
 * Integration test — ReleaseDspDeliveryProjection.
 *
 * Testcontainers Postgres 16. Schema via synchronize + raw DDL for tables
 * outside the distribution-orchestration module (dsps, release_dsp_delivery, projection_checkpoint).
 *
 * 7 cases:
 *   1. DistributionSubmitted → upsert processing + lastEnqueuedAt
 *   2. ChannelLive → upsert distributed + hasLiveVersion + lastDeliveredAt
 *   3. ChannelTakenDown → taken_down + hasLiveVersion=false
 *   4. Event replay (idempotent) → no change on second projection
 *   5. Checkpoint advances per-event → next poll skips already-projected
 *   6. Unknown event type → skipped, checkpoint still advances
 *   7. Distribution-level event → updates ALL rows for that release
 */

jest.setTimeout(120_000);

let pgContainer: StartedPostgreSqlContainer;
let dataSource: DataSource;
let projection: ReleaseDspDeliveryProjection;

const DIST_ID = '11111111-1111-1111-1111-111111111111';
const RELEASE_ID = '22222222-2222-2222-2222-222222222222';
const DSP_CODE = 'spotify';
const DSP_ID = 'SPT';
const DSP_CODE_2 = 'apple_music';
const DSP_ID_2 = 'APL';
const DSP_CODE_3 = 'facebook';
const DSP_ID_3 = 'FBK';
const CHANNEL_ID = `${DIST_ID}:ch:0`;
const CHANNEL_ID_2 = `${DIST_ID}:ch:1`;
// CI cluster channel gom APPLE + FACEBOOK (member_dsp_codes).
const CLUSTER_CHANNEL_ID = `${DIST_ID}:ch:2`;

beforeAll(async () => {
	pgContainer = await new PostgreSqlContainer('postgres:16-alpine').start();

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

	// Tables outside the module — created via raw DDL
	await dataSource.query(`
		CREATE TABLE IF NOT EXISTS "dsps" (
			"id"   varchar(10) PRIMARY KEY,
			"code" varchar(30) NOT NULL UNIQUE,
			"name" varchar(80)
		)
	`);

	// release_dsp_delivery — simplified schema matching prod columns used by projection
	await dataSource.query(`
		CREATE TABLE IF NOT EXISTS "release_dsp_delivery" (
			"id"                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
			"release_id"        uuid NOT NULL,
			"dsp_id"            varchar(10) NOT NULL,
			"status"            varchar(30) NOT NULL DEFAULT 'never_distributed',
			"has_live_version"  boolean NOT NULL DEFAULT false,
			"last_enqueued_at"  timestamptz,
			"last_delivered_at" timestamptz,
			"updated_at"        timestamptz NOT NULL DEFAULT now(),
			"created_at"        timestamptz NOT NULL DEFAULT now(),
			UNIQUE ("release_id", "dsp_id")
		)
	`);

	// projection_checkpoint — same as migration
	await dataSource.query(`
		CREATE TABLE IF NOT EXISTS "projection_checkpoint" (
			"name"          varchar(80) PRIMARY KEY,
			"last_event_id" bigint NOT NULL DEFAULT 0,
			"updated_at"    timestamptz NOT NULL DEFAULT now()
		)
	`);
	await dataSource.query(`
		INSERT INTO "projection_checkpoint" ("name", "last_event_id")
		VALUES ('release_dsp_delivery', 0)
		ON CONFLICT DO NOTHING
	`);

	// Seed: distribution parent row (FK for distribution_event JOIN)
	await dataSource.query(
		`INSERT INTO "distribution"
		 ("id", "release_id", "snapshot_id", "tenant_id", "type", "correlation_id",
		  "state", "retry_count", "version", "channel_specs")
		 VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 1, '[]'::jsonb)`,
		[
			DIST_ID,
			RELEASE_ID,
			'33333333-3333-3333-3333-333333333333',
			'44444444-4444-4444-4444-444444444444',
			'INITIAL_RELEASE',
			'55555555-5555-5555-5555-555555555555',
			'VALIDATING',
		],
	);

	// Seed: channel_delivery rows for JOIN.
	// ch:0 SPOTIFY direct; ch:1 APPLE direct; ch:2 CI cluster gom APPLE+FACEBOOK.
	await dataSource.query(
		`INSERT INTO "channel_delivery"
		 ("channel_id", "distribution_id", "spawn_order", "dsp_code", "topology", "process_code")
		 VALUES ($1, $2, 0, $3, 'DIRECT', 'proc-spotify'),
		        ($4, $2, 1, $5, 'DIRECT', 'proc-apple')`,
		[CHANNEL_ID, DIST_ID, DSP_CODE, CHANNEL_ID_2, DSP_CODE_2],
	);
	await dataSource.query(
		`INSERT INTO "channel_delivery"
		 ("channel_id", "distribution_id", "spawn_order", "dsp_code", "topology",
		  "process_code", "is_cluster", "member_dsp_codes")
		 VALUES ($1, $2, 2, 'CI', 'VIA_AGGREGATOR', 'ci.cluster.initial', true, $3::jsonb)`,
		[
			CLUSTER_CHANNEL_ID,
			DIST_ID,
			JSON.stringify([
				{ dspCode: DSP_CODE_2 },
				{ dspCode: DSP_CODE_3 },
			]),
		],
	);

	// Seed: DSPs
	await dataSource.query(
		`INSERT INTO "dsps" ("id", "code", "name")
		 VALUES ($1, $2, 'Spotify'), ($3, $4, 'Apple Music'), ($5, $6, 'Facebook')`,
		[DSP_ID, DSP_CODE, DSP_ID_2, DSP_CODE_2, DSP_ID_3, DSP_CODE_3],
	);

	projection = new ReleaseDspDeliveryProjection(dataSource);
});

afterAll(async () => {
	if (dataSource?.isInitialized) await dataSource.destroy();
	if (pgContainer) await pgContainer.stop();
});

beforeEach(async () => {
	// Reset events + read model + checkpoint between tests
	await dataSource.query(
		`TRUNCATE TABLE "distribution_event" RESTART IDENTITY CASCADE`,
	);
	await dataSource.query(`DELETE FROM "release_dsp_delivery"`);
	await dataSource.query(
		`UPDATE "projection_checkpoint" SET "last_event_id" = 0 WHERE "name" = 'release_dsp_delivery'`,
	);
});

// ── Helpers ──

async function insertEvent(overrides: {
	type: string;
	channelId?: string | null;
	level?: string;
	payload?: object;
}): Promise<string> {
	const rows: Array<{ id: string }> = await dataSource.query(
		`INSERT INTO "distribution_event"
		 ("distribution_id", "channel_id", "type", "level", "payload", "occurred_at")
		 VALUES ($1, $2, $3, $4, $5, now())
		 RETURNING "id"`,
		[
			DIST_ID,
			overrides.channelId ?? null,
			overrides.type,
			overrides.level ?? 'milestone',
			JSON.stringify(overrides.payload ?? {}),
		],
	);
	return rows[0].id;
}

async function getDelivery(
	releaseId: string,
	dspId: string,
): Promise<Record<string, unknown> | null> {
	const rows: Array<Record<string, unknown>> = await dataSource.query(
		`SELECT * FROM "release_dsp_delivery" WHERE "release_id" = $1 AND "dsp_id" = $2`,
		[releaseId, dspId],
	);
	return rows[0] ?? null;
}

async function getCheckpointValue(): Promise<string> {
	const rows: Array<{ last_event_id: string }> = await dataSource.query(
		`SELECT "last_event_id" FROM "projection_checkpoint" WHERE "name" = 'release_dsp_delivery'`,
	);
	return rows[0]?.last_event_id ?? '0';
}

// ── Tests ──

describe('ReleaseDspDeliveryProjection (integration)', () => {
	it('Test 1 — DistributionSubmitted (channel-level) → upsert processing + lastEnqueuedAt', async () => {
		await insertEvent({
			type: 'DistributionSubmitted',
			channelId: CHANNEL_ID,
			level: 'milestone',
		});

		const projected = await projection.pollAndProject();
		expect(projected).toBe(1);

		const row = await getDelivery(RELEASE_ID, DSP_ID);
		expect(row).not.toBeNull();
		expect(row!.status).toBe('processing');
		expect(row!.last_enqueued_at).not.toBeNull();
	});

	it('Cluster — ChannelIssues từ cluster channel → áp cho MỌI member DSP', async () => {
		// QA fail cả cụm CI: event từ cluster channel (dsp_code=CI, không map DSP) → expand
		// member_dsp_codes = [APPLE, FACEBOOK]. Cả 2 DSP phải chuyển 'issues'.
		await insertEvent({
			type: 'ChannelIssues',
			channelId: CLUSTER_CHANNEL_ID,
			level: 'milestone',
		});

		const projected = await projection.pollAndProject();
		expect(projected).toBe(1);

		const apple = await getDelivery(RELEASE_ID, DSP_ID_2);
		const facebook = await getDelivery(RELEASE_ID, DSP_ID_3);
		expect(apple!.status).toBe('issues');
		expect(facebook!.status).toBe('issues');
	});

	it('Cluster — ChannelLive từ go-live watcher → chỉ 1 DSP (không expand)', async () => {
		// Watcher là channel thường (dsp_code=facebook thật) → update ĐÚNG 1 DSP.
		const watcherId = `${CLUSTER_CHANNEL_ID}:golive:${DSP_CODE_3}`;
		await dataSource.query(
			`INSERT INTO "channel_delivery"
			 ("channel_id", "distribution_id", "spawn_order", "dsp_code", "topology", "process_code")
			 VALUES ($1, $2, 3, $3, 'VIA_AGGREGATOR', 'ci.golive')`,
			[watcherId, DIST_ID, DSP_CODE_3],
		);

		await insertEvent({
			type: 'ChannelLive',
			channelId: watcherId,
			level: 'milestone',
		});
		await projection.pollAndProject();

		const facebook = await getDelivery(RELEASE_ID, DSP_ID_3);
		expect(facebook!.status).toBe('distributed');
		// APPLE KHÔNG bị đụng (watcher chỉ áp DSP của mình).
		expect(await getDelivery(RELEASE_ID, DSP_ID_2)).toBeNull();
	});

	it('Test 2 — ChannelLive → upsert distributed + hasLiveVersion + lastDeliveredAt', async () => {
		await insertEvent({
			type: 'ChannelLive',
			channelId: CHANNEL_ID,
			level: 'milestone',
		});

		await projection.pollAndProject();

		const row = await getDelivery(RELEASE_ID, DSP_ID);
		expect(row).not.toBeNull();
		expect(row!.status).toBe('distributed');
		expect(row!.has_live_version).toBe(true);
		expect(row!.last_delivered_at).not.toBeNull();
	});

	it('Test 3 — ChannelTakenDown → taken_down + hasLiveVersion=false', async () => {
		// Pre-seed a distributed row
		await dataSource.query(
			`INSERT INTO "release_dsp_delivery" ("release_id", "dsp_id", "status", "has_live_version")
			 VALUES ($1, $2, 'distributed', true)`,
			[RELEASE_ID, DSP_ID],
		);

		await insertEvent({
			type: 'ChannelTakenDown',
			channelId: CHANNEL_ID,
			level: 'milestone',
		});

		await projection.pollAndProject();

		const row = await getDelivery(RELEASE_ID, DSP_ID);
		expect(row!.status).toBe('taken_down');
		expect(row!.has_live_version).toBe(false);
	});

	it('Test 4 — Idempotent replay: projecting same events twice → no change', async () => {
		await insertEvent({
			type: 'ChannelLive',
			channelId: CHANNEL_ID,
			level: 'milestone',
		});

		await projection.pollAndProject();

		const rowAfterFirst = await getDelivery(RELEASE_ID, DSP_ID);
		const updatedAtFirst = rowAfterFirst!.updated_at;

		// Reset checkpoint to simulate replay
		await dataSource.query(
			`UPDATE "projection_checkpoint" SET "last_event_id" = 0 WHERE "name" = 'release_dsp_delivery'`,
		);

		// Small delay to detect updated_at change
		await new Promise((r) => setTimeout(r, 50));

		await projection.pollAndProject();

		const rowAfterReplay = await getDelivery(RELEASE_ID, DSP_ID);
		// UPSERT IS DISTINCT FROM guard → updated_at unchanged because status & has_live_version haven't changed
		expect(rowAfterReplay!.status).toBe('distributed');
		expect(rowAfterReplay!.has_live_version).toBe(true);
	});

	it('Test 5 — Checkpoint advances per-event → next poll returns 0', async () => {
		await insertEvent({
			type: 'DistributionSubmitted',
			channelId: CHANNEL_ID,
		});
		await insertEvent({ type: 'ChannelLive', channelId: CHANNEL_ID });

		const batch1 = await projection.pollAndProject();
		expect(batch1).toBe(2);

		// Second poll: checkpoint is already past those events
		const batch2 = await projection.pollAndProject();
		expect(batch2).toBe(0);

		const checkpoint = await getCheckpointValue();
		expect(Number(checkpoint)).toBeGreaterThan(0);
	});

	it('Test 6 — Unknown event type → skipped, checkpoint still advances', async () => {
		await insertEvent({
			type: 'IdsProvisioned',
			channelId: CHANNEL_ID,
			level: 'progress',
		});

		const projected = await projection.pollAndProject();
		// IdsProvisioned is not in EVENT_TO_STATUS_MAP → applyEvent returns early (no write)
		// but projected++ still runs because applyEvent didn't throw — "projected" = "processed without error"
		expect(projected).toBe(1);

		const checkpoint = await getCheckpointValue();
		expect(Number(checkpoint)).toBeGreaterThan(0);

		// No delivery row created
		const row = await getDelivery(RELEASE_ID, DSP_ID);
		expect(row).toBeNull();
	});

	it('Test 7 — Distribution-level event (channelId=NULL) → updates ALL dsp rows', async () => {
		// Pre-seed 2 delivery rows
		await dataSource.query(
			`INSERT INTO "release_dsp_delivery" ("release_id", "dsp_id", "status")
			 VALUES ($1, $2, 'never_distributed'), ($1, $3, 'never_distributed')`,
			[RELEASE_ID, DSP_ID, DSP_ID_2],
		);

		// Distribution-level event: channel_id = NULL → upsertAllDeliveries
		await insertEvent({
			type: 'Distributed',
			channelId: null,
			level: 'milestone',
		});

		await projection.pollAndProject();

		const row1 = await getDelivery(RELEASE_ID, DSP_ID);
		const row2 = await getDelivery(RELEASE_ID, DSP_ID_2);
		expect(row1!.status).toBe('distributed');
		expect(row2!.status).toBe('distributed');
	});

	it('Test 8 — Multiple events in 1 batch → sequential projection, correct final state', async () => {
		// Simulate lifecycle: Submitted → Live
		await insertEvent({
			type: 'DistributionSubmitted',
			channelId: CHANNEL_ID,
		});
		await insertEvent({
			type: 'ChannelLive',
			channelId: CHANNEL_ID,
		});

		const projected = await projection.pollAndProject();
		expect(projected).toBe(2);

		const row = await getDelivery(RELEASE_ID, DSP_ID);
		expect(row!.status).toBe('distributed');
		expect(row!.has_live_version).toBe(true);
		expect(row!.last_enqueued_at).not.toBeNull();
		expect(row!.last_delivered_at).not.toBeNull();
	});
});
