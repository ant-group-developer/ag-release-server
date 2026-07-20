import {
	PostgreSqlContainer,
	StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { DataSource, Repository } from 'typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

import { IdempotencyKey } from '../../../domain/value-objects/idempotency-key.vo';
import { TicketMetadata } from '../../../domain/value-objects/ticket-metadata.vo';
import { TicketReason } from '../../../domain/value-objects/ticket-ref.vo';
import { OrchestrationTicketOrmEntity } from '../../persistence/orchestration-ticket.orm-entity';
import { PostgresTicketAdapter } from '../postgres-ticket.adapter';

/**
 * Integration test — PostgresTicketAdapter chạy DB thật (testcontainers Postgres).
 *
 * beforeAll  : spin container → build DataSource → synchronize (auto CREATE TABLE)
 * beforeEach : TRUNCATE orchestration_ticket
 * afterAll   : destroy + stop
 *
 * 6 cases:
 *  1. Open ticket with metadata → verify row + metadata jsonb
 *  2. Idempotency — cùng key 2x → cùng TicketRef, DB 1 row
 *  3. Open without metadata → row có metadata null
 *  4. Resolve → status='resolved', resolved_at set
 *  5. Resolve non-existent → no-op, không throw
 *  6. Metadata JSONB round-trip → structured items preserved
 */
jest.setTimeout(90_000);

let container: StartedPostgreSqlContainer;
let dataSource: DataSource;
let repo: Repository<OrchestrationTicketOrmEntity>;
let adapter: PostgresTicketAdapter;

const DIST_ID = '11111111-1111-1111-1111-111111111111';
const CHANNEL_ID = 'ch-spotify-initial';

function makeKey(raw: string): IdempotencyKey {
	return IdempotencyKey.create(raw);
}

const sampleMetadata: TicketMetadata = {
	items: [
		{
			code: 'AUD001',
			message: 'Audio Clipping Detected',
			severity: 'error',
			location: 'Track 3',
			suggestion: 'Re-master track 3 to avoid clipping',
		},
		{
			code: 'META002',
			message: 'Missing ISRC',
			severity: 'warning',
			location: 'Track 5',
		},
	],
	context: { upc: '701798205454', ciReleaseId: '117827288390032' },
};

beforeAll(async () => {
	container = await new PostgreSqlContainer('postgres:16-alpine').start();

	dataSource = new DataSource({
		type: 'postgres',
		host: container.getHost(),
		port: container.getPort(),
		username: container.getUsername(),
		password: container.getPassword(),
		database: container.getDatabase(),
		entities: [OrchestrationTicketOrmEntity],
		synchronize: true,
		namingStrategy: new SnakeNamingStrategy(),
	});
	await dataSource.initialize();

	repo = dataSource.getRepository(OrchestrationTicketOrmEntity);
	adapter = new PostgresTicketAdapter(repo);
});

beforeEach(async () => {
	await repo.query('TRUNCATE "orchestration_ticket" CASCADE');
});

afterAll(async () => {
	if (dataSource?.isInitialized) await dataSource.destroy();
	if (container) await container.stop();
});

describe('PostgresTicketAdapter', () => {
	it('opens a ticket with metadata and persists to DB', async () => {
		const ref = await adapter.open({
			distributionId: DIST_ID,
			channelId: CHANNEL_ID,
			reason: TicketReason.QA_FLAG,
			detail: 'QA flagged with 2 issues',
			metadata: sampleMetadata,
			key: makeKey('qa-flag-key-1'),
		});

		expect(ref.value).toBeDefined();

		const row = await repo.findOneBy({ id: ref.value });
		expect(row).not.toBeNull();
		expect(row!.distributionId).toBe(DIST_ID);
		expect(row!.channelId).toBe(CHANNEL_ID);
		expect(row!.reason).toBe(TicketReason.QA_FLAG);
		expect(row!.detail).toBe('QA flagged with 2 issues');
		expect(row!.status).toBe('open');
		expect(row!.idempotencyKey).toBe('qa-flag-key-1');
		expect(row!.metadata).toEqual(sampleMetadata);
		expect(row!.resolvedAt).toBeNull();
	});

	it('is idempotent — same key returns same TicketRef, only 1 row', async () => {
		const key = makeKey('idempotent-key-1');

		const ref1 = await adapter.open({
			distributionId: DIST_ID,
			reason: TicketReason.INGEST_FAIL,
			detail: 'Import problem',
			key,
		});

		const ref2 = await adapter.open({
			distributionId: DIST_ID,
			reason: TicketReason.INGEST_FAIL,
			detail: 'Import problem (retry)',
			key,
		});

		expect(ref1.value).toBe(ref2.value);

		const count = await repo.count();
		expect(count).toBe(1);
	});

	it('opens ticket without metadata — metadata is null', async () => {
		const ref = await adapter.open({
			distributionId: DIST_ID,
			reason: TicketReason.UPLOAD_FAIL,
			detail: 'SFTP upload failed',
			key: makeKey('no-metadata-key'),
		});

		const row = await repo.findOneBy({ id: ref.value });
		expect(row!.metadata).toBeNull();
		expect(row!.channelId).toBeNull();
	});

	it('resolves a ticket — status changes and resolvedAt is set', async () => {
		const ref = await adapter.open({
			distributionId: DIST_ID,
			reason: TicketReason.QA_FLAG,
			detail: 'Will be resolved',
			key: makeKey('resolve-key-1'),
		});

		await adapter.resolve({ ticket: ref });

		const row = await repo.findOneBy({ id: ref.value });
		expect(row!.status).toBe('resolved');
		expect(row!.resolvedAt).toBeInstanceOf(Date);
	});

	it('resolve non-existent ticket — no-op, does not throw', async () => {
		const { TicketRef } =
			await import('../../../domain/value-objects/ticket-ref.vo');
		const fakeRef = TicketRef.create(
			'99999999-9999-9999-9999-999999999999',
		);

		await expect(
			adapter.resolve({ ticket: fakeRef }),
		).resolves.not.toThrow();
	});

	it('metadata JSONB round-trip — structured items preserved', async () => {
		const ref = await adapter.open({
			distributionId: DIST_ID,
			channelId: CHANNEL_ID,
			reason: TicketReason.INGEST_FAIL,
			detail: 'Import problem: 2 warnings',
			metadata: {
				items: [
					{
						code: 'ISRC_CONFLICT',
						message: 'ISRC conflict: Track 3 ISRC already assigned',
						severity: 'error',
						location: 'Track 3',
					},
					{
						code: 'BARCODE_WARN',
						message: 'Barcode checksum mismatch',
						severity: 'warning',
					},
				],
				context: {
					upc: '701798205454',
					batchExternalId: '20260704183607027',
				},
			},
			key: makeKey('metadata-roundtrip-key'),
		});

		const row = await repo.findOneBy({ id: ref.value });
		const meta = row!.metadata as TicketMetadata;

		expect(meta.items).toHaveLength(2);
		expect(meta.items[0].code).toBe('ISRC_CONFLICT');
		expect(meta.items[0].severity).toBe('error');
		expect(meta.items[0].location).toBe('Track 3');
		expect(meta.items[1].code).toBe('BARCODE_WARN');
		expect(meta.items[1].severity).toBe('warning');
		expect(meta.items[1].location).toBeUndefined();
		expect(meta.context).toEqual({
			upc: '701798205454',
			batchExternalId: '20260704183607027',
		});
	});
});
