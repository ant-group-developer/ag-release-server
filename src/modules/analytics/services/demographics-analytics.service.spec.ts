import { Test } from '@nestjs/testing';
import { ClickHouseService } from 'src/modules/clickhouse/clickhouse.service';
import { AnalyticsCacheService } from './analytics-cache.service';
import { DemographicsAnalyticsService } from './demographics-analytics.service';

describe('DemographicsAnalyticsService DSP bar charts', () => {
	let service: DemographicsAnalyticsService;
	const clickHouseService = { query: jest.fn() };
	const cache = {
		buildKey: jest.fn((...parts: unknown[]) => JSON.stringify(parts)),
		wrap: jest.fn((_key: string, fn: () => unknown) => fn()),
	};

	beforeEach(async () => {
		const moduleRef = await Test.createTestingModule({
			providers: [
				DemographicsAnalyticsService,
				{ provide: ClickHouseService, useValue: clickHouseService },
				{ provide: AnalyticsCacheService, useValue: cache },
			],
		}).compile();
		service = moduleRef.get(DemographicsAnalyticsService);
		jest.clearAllMocks();
		cache.wrap.mockImplementation((_key, fn) => fn());
	});

	const dto = {
		pgDspId: 'fb8a10b607',
		dspReportId: '59538819-fd63-4fa7-a147-fdef62ed2ec7',
		fromDate: '2026-02-01',
		toDate: '2026-08-31',
		sortBy: 'views' as const,
	};

	it('returns empty items when the DSP is not Vevo', async () => {
		clickHouseService.query.mockResolvedValueOnce([{ dsp_name: 'fbk-facebook' }]);

		const result = await service.getDspDeviceBarChart(
			dto,
			'system-tenant',
		);

		expect(result).toEqual({ totalViews: 0, coverage: null, items: [] });
	});

	it('returns device bars with percents that sum to 100 for Vevo', async () => {
		clickHouseService.query
			.mockResolvedValueOnce([{ dsp_name: 'vvo-vevo' }])
			.mockResolvedValueOnce([
				{ dimension_value: 'mobile phone', views: '60' },
				{ dimension_value: 'tv', views: '40' },
			]);

		const result = await service.getDspDeviceBarChart(
			dto,
			'system-tenant',
		);

		expect(result.totalViews).toBe(100);
		expect(result.coverage).toBeNull();
		expect(result.items.map((item) => item.label)).toEqual([
			'mobile phone',
			'tv',
		]);
		expect(result.items.reduce((sum, item) => sum + item.percent, 0)).toBe(
			100,
		);
	});

	it('allows channel-only payload without pgDspId or dspReportId', async () => {
		clickHouseService.query.mockImplementation(async (sql: string) => {
			expect(sql).not.toContain('dsp_name');
			expect(sql).toContain('t.channel_id = {channelId:String}');
			return [{ dimension_value: 'mobile phone', views: '10' }];
		});

		const result = await service.getDspDeviceBarChart(
			{
				fromDate: '2026-01-01',
				toDate: '2026-08-30',
				sortBy: 'views',
				channelId: '1e848dbb-80df-4f91-8b00-f0e286517534',
			},
			'system-tenant',
		);

		expect(result.totalViews).toBe(10);
		expect(result.items).toHaveLength(1);
	});

	it('joins pg_tracks_sync and filters channel/release when those ids are set', async () => {
		clickHouseService.query.mockImplementation(async (sql: string) => {
			if (sql.includes('dsp_name')) {
				return [{ dsp_name: 'vvo-vevo' }];
			}
			expect(sql).toContain('t.channel_id = {channelId:String}');
			expect(sql).toContain('t.release_id = {releaseId:String}');
			return [{ dimension_value: 'mobile phone', views: '10' }];
		});

		await service.getDspDeviceBarChart(
			{
				...dto,
				channelId: '11111111-1111-1111-1111-111111111111',
				releaseId: '22222222-2222-2222-2222-222222222222',
			},
			'system-tenant',
		);
	});

	it('orders age buckets by range, not by views', async () => {
		clickHouseService.query
			.mockResolvedValueOnce([{ dsp_name: 'vvo-vevo' }])
			.mockResolvedValueOnce([
				{ dimension_value: 'AGE_25_34', views: '50' },
				{ dimension_value: 'AGE_13_17', views: '10' },
			])
			.mockResolvedValueOnce([{ dimension_value: 'mobile phone', views: '80' }]);

		const result = await service.getDspAgeBarChart(dto, 'system-tenant');

		expect(result.items.map((item) => item.dimensionValue)).toEqual([
			'AGE_13_17',
			'AGE_25_34',
		]);
		expect(result.coverage).toBe(0.75);
	});
});
