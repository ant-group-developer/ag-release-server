import { GenericContainer, StartedTestContainer } from 'testcontainers';
import { DataSource } from 'typeorm';
import { DistributionTimelineQueryService } from '../distribution-timeline-query.service';
import { decodeCursor, encodeCursor } from '../distribution-timeline.query';

/**
 * Integration test cho DistributionTimelineQueryService.
 * Dùng testcontainers Postgres 16-alpine — không mock DB.
 *
 * Setup: tạo bảng distribution_event với schema tối giản (chỉ cột timeline cần).
 * Seed: 5 events (3 milestone + 2 progress) cho 1 distribution.
 */
describe('DistributionTimelineQueryService (integration)', () => {
	let container: StartedTestContainer;
	let dataSource: DataSource;
	let service: DistributionTimelineQueryService;

	const DIST_ID = '11111111-1111-1111-1111-111111111111';
	const OTHER_DIST_ID = '22222222-2222-2222-2222-222222222222';

	beforeAll(async () => {
		container = await new GenericContainer('postgres:16-alpine')
			.withEnvironment({
				POSTGRES_USER: 'test',
				POSTGRES_PASSWORD: 'test',
				POSTGRES_DB: 'test',
			})
			.withExposedPorts(5432)
			.start();

		dataSource = new DataSource({
			type: 'postgres',
			host: container.getHost(),
			port: container.getMappedPort(5432),
			username: 'test',
			password: 'test',
			database: 'test',
			synchronize: false,
		});
		await dataSource.initialize();

		await dataSource.query(`
			CREATE TABLE distribution_event (
				id         bigserial PRIMARY KEY,
				distribution_id uuid NOT NULL,
				channel_id      varchar(80),
				type            varchar(60) NOT NULL,
				level           varchar(20) NOT NULL DEFAULT 'milestone',
				payload         jsonb NOT NULL DEFAULT '{}',
				occurred_at     timestamptz NOT NULL DEFAULT now(),
				created_at      timestamptz NOT NULL DEFAULT now()
			);
			CREATE INDEX ON distribution_event (distribution_id, id);
		`);

		// Seed: 3 milestone + 2 progress cho DIST_ID; 1 event cho OTHER_DIST_ID
		await dataSource.query(`
			INSERT INTO distribution_event (distribution_id, channel_id, type, level, payload)
			VALUES
			  ('${DIST_ID}', NULL,                                     'DistributionSubmitted', 'milestone', '{"channelCount":2}'),
			  ('${DIST_ID}', '${DIST_ID}:ch:0', 'ChannelStarted',     'milestone', '{"stageKey":"ACTION_deliver"}'),
			  ('${DIST_ID}', '${DIST_ID}:ch:0', 'ActionRetried',      'progress',  '{"attempt":1}'),
			  ('${DIST_ID}', '${DIST_ID}:ch:0', 'ActionRetried',      'progress',  '{"attempt":2}'),
			  ('${DIST_ID}', '${DIST_ID}:ch:0', 'ChannelLive',        'milestone', '{}'),
			  ('${OTHER_DIST_ID}', NULL,         'DistributionSubmitted','milestone','{}')
		`);

		service = new DistributionTimelineQueryService(dataSource);
	}, 60_000);

	afterAll(async () => {
		await dataSource.destroy();
		await container.stop();
	});

	it('trả milestone events khi level=milestone', async () => {
		const result = await service.getTimeline({
			distributionId: DIST_ID,
			level: 'milestone',
		});

		expect(result.items).toHaveLength(3);
		expect(result.items.map((e) => e.type)).toEqual([
			'DistributionSubmitted',
			'ChannelStarted',
			'ChannelLive',
		]);
		expect(result.nextCursor).toBeNull();
	});

	it('trả tất cả events khi level=undefined (admin)', async () => {
		const result = await service.getTimeline({ distributionId: DIST_ID });

		expect(result.items).toHaveLength(5);
	});

	it('cursor pagination — limit=2 trả 2 item + nextCursor', async () => {
		const page1 = await service.getTimeline({
			distributionId: DIST_ID,
			limit: 2,
		});

		expect(page1.items).toHaveLength(2);
		expect(page1.nextCursor).not.toBeNull();

		const page2 = await service.getTimeline({
			distributionId: DIST_ID,
			limit: 2,
			cursor: page1.nextCursor!,
		});

		expect(page2.items).toHaveLength(2);

		const page3 = await service.getTimeline({
			distributionId: DIST_ID,
			limit: 2,
			cursor: page2.nextCursor!,
		});

		expect(page3.items).toHaveLength(1);
		expect(page3.nextCursor).toBeNull();
	});

	it('không trả events của distribution khác', async () => {
		const result = await service.getTimeline({ distributionId: DIST_ID });

		const ids = result.items.map((e) => e.id);
		// Tất cả id đều thuộc DIST_ID, không có event của OTHER_DIST_ID
		for (const item of result.items) {
			// channel_id null hoặc starts with DIST_ID
			if (item.channelId) {
				expect(item.channelId.startsWith(DIST_ID)).toBe(true);
			}
		}
	});

	it('channel_id đúng — null với event cấp distribution, có với channel event', async () => {
		const result = await service.getTimeline({
			distributionId: DIST_ID,
			level: 'milestone',
		});

		expect(result.items[0].channelId).toBeNull(); // DistributionSubmitted
		expect(result.items[1].channelId).toBe(`${DIST_ID}:ch:0`); // ChannelStarted
	});

	it('payload deserialize đúng từ jsonb', async () => {
		const result = await service.getTimeline({
			distributionId: DIST_ID,
			level: 'milestone',
		});

		expect(result.items[0].payload).toMatchObject({ channelCount: 2 });
	});

	it('encodeCursor / decodeCursor round-trip', () => {
		const id = '12345678';
		expect(decodeCursor(encodeCursor(id))).toBe(id);
	});

	it('decodeCursor invalid input → trả "0"', () => {
		expect(decodeCursor('!!!invalid')).toBe('0');
		expect(decodeCursor('')).toBe('0');
	});
});
