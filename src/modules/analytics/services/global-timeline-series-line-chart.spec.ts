import { SYSTEM_TENANT_ID } from 'src/modules/tenant/tenant.constant';
import { AnalyticsCacheService } from './analytics-cache.service';
import { TimelineAnalyticsService } from './global-timeline.service';

describe('TimelineAnalyticsService V2 series line charts', () => {
	function createService(rows: unknown[]) {
		const clickhouse = { query: jest.fn().mockResolvedValue(rows) };
		const resolver = {
			getTrackMetadataMap: jest.fn().mockResolvedValue(new Map()),
			getReleaseMetadata: jest.fn().mockResolvedValue(new Map()),
			getTenantMetadata: jest.fn().mockResolvedValue(new Map()),
			getLabelMetadata: jest.fn().mockResolvedValue(new Map()),
			getArtistMetadata: jest.fn().mockResolvedValue(new Map()),
			getChannelMetadata: jest.fn().mockResolvedValue(new Map()),
		};
		const service = new TimelineAnalyticsService(
			clickhouse as never,
			resolver as never,
			{} as never,
			new AnalyticsCacheService(),
			{ resolve: jest.fn() } as never,
		);
		return { service, clickhouse };
	}

	it('preserves request order and returns empty values for a selected ISRC without facts', async () => {
		const { service, clickhouse } = createService([
			{
				series_id: 'USAAA2600002',
				period: '2026-01-02',
				total_views: '12',
			},
		]);

		const result = await service.getTrendViewSeriesLineChart(
			SYSTEM_TENANT_ID,
			{
				fromDate: '2026-01-01',
				toDate: '2026-01-31',
				filters: { isrcs: ['USAAA2600001', 'USAAA2600002'] },
			},
		);

		expect(result).toEqual({
			seriesBy: 'isrc',
			series: [
				{
					id: 'USAAA2600001',
					metadata: {
						id: 'USAAA2600001',
						type: 'isrc',
						name: 'USAAA2600001',
						imageUrl: null,
					},
					values: [],
				},
				{
					id: 'USAAA2600002',
					metadata: {
						id: 'USAAA2600002',
						type: 'isrc',
						name: 'USAAA2600002',
						imageUrl: null,
					},
					values: [{ period: '2026-01-02', totalViews: 12 }],
				},
			],
		});
		expect(clickhouse.query.mock.calls[0][0]).toContain(
			's.isrc IN ({isrcs:Array(String)})',
		);
	});

	it('normalizes revenue dates and returns a valid empty response when filters do not intersect', async () => {
		const { service, clickhouse } = createService([]);

		const result = await service.getRevenueSeriesLineChart(
			SYSTEM_TENANT_ID,
			{
				fromDate: '2026-01-12',
				toDate: '2026-02-20',
				filters: {
					tenantIds: ['11111111-1111-4111-8111-111111111111'],
					releaseIds: ['22222222-2222-4222-8222-222222222222'],
				},
			},
		);

		expect(result).toEqual({
			seriesBy: 'release',
			series: [
				{
					id: '22222222-2222-4222-8222-222222222222',
					metadata: {
						id: '22222222-2222-4222-8222-222222222222',
						type: 'release',
						name: '22222222-2222-4222-8222-222222222222',
						imageUrl: null,
					},
					values: [],
				},
			],
		});
		expect(clickhouse.query.mock.calls[0][1]).toMatchObject({
			from: '2026-01-01',
			to: '2026-02-01',
		});
	});
});
