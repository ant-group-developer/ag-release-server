import { SYSTEM_TENANT_ID } from 'src/modules/tenant/tenant.constant';
import { AnalyticsCacheService } from './analytics-cache.service';
import { TimelineAnalyticsService } from './global-timeline.service';

describe('TimelineAnalyticsService V2 aggregate widgets', () => {
	function createService(query: jest.Mock) {
		return new TimelineAnalyticsService(
			{ query } as never,
			{} as never,
			{} as never,
			new AnalyticsCacheService(),
			{} as never,
		);
	}

	it('uses the same array scope for the V2 trend summary', async () => {
		const query = jest.fn().mockImplementation((sql: string) => {
			if (sql.includes('total_artists')) {
				return [{ total_artists: '4' }];
			}
			return [
				{
					total_views: '120',
					total_dsps: '2',
					total_tracks: '3',
					total_labels: '1',
				},
			];
		});
		const service = createService(query);

		await expect(
			service.getTrendsOverviewV2(SYSTEM_TENANT_ID, {
				fromDate: '2026-01-01',
				toDate: '2026-01-31',
				filters: {
					tenantIds: ['11111111-1111-4111-8111-111111111111'],
					isrcs: ['USAAA2600001'],
				},
			}),
		).resolves.toEqual({
			totalViews: 120,
			totalDsps: 2,
			totalTracks: 3,
			totalArtists: 4,
			totalLabels: 1,
		});

		for (const [, params] of query.mock.calls) {
			expect(params).toMatchObject({
				tenantIds: ['11111111-1111-4111-8111-111111111111'],
				isrcs: ['USAAA2600001'],
			});
		}
	});

	it('applies one V2 filter payload to all unified summary metrics', async () => {
		const query = jest.fn().mockImplementation((sql: string) => {
			if (sql.includes('total_trend_views')) {
				return [{ total_trend_views: '120' }];
			}
			return [{ total_usage: '45', total_revenue_usd: '6.75' }];
		});
		const service = createService(query);

		await expect(
			service.getSummaryV2(SYSTEM_TENANT_ID, {
				fromDate: '2026-01-12',
				toDate: '2026-02-20',
				filters: {
					isrcs: ['USAAA2600001'],
				},
			}),
		).resolves.toEqual({
			totalTrendViews: 120,
			totalUsage: 45,
			totalRevenueUsd: 6.75,
			totalRevenueUsdExact: '6.75',
		});

		const callsBySql = query.mock.calls.map(([sql, params]) => ({
			sql: sql as string,
			params,
		}));
		expect(
			callsBySql.find((call) =>
				call.sql.includes('total_trend_views'),
			)?.params,
		).toMatchObject({
			isrcs: ['USAAA2600001'],
			from: '2026-01-12',
			to: '2026-02-20',
		});
		expect(
			callsBySql.find((call) => call.sql.includes('total_usage'))?.params,
		).toMatchObject({
			isrcs: ['USAAA2600001'],
			from: '2026-01-01',
			to: '2026-02-01',
		});
	});

	it('keeps DSP IDs paired and orders the revenue DSP bar by usage', async () => {
		const query = jest.fn().mockImplementation((sql: string) => {
			if (sql.includes('AS total_rev')) {
				return [{ total_rev: '12.5', total_qty: '10' }];
			}
			return [
				{
					pg_dsp_id: 'spotify',
					dsp_report_id: 'spotify-us',
					dsp_report_ids: ['spotify-us'],
					dsp_name: 'Spotify',
					image_url: null,
					revenue_usd: '12.5',
					quantity: '10',
				},
			];
		});
		const service = createService(query);

		const result = await service.getRevenueDspBarChartV2(
			SYSTEM_TENANT_ID,
			{
				fromDate: '2026-01-12',
				toDate: '2026-02-20',
				metric: 'usage',
				filters: {
					dspIds: [
						{
							pgDspId: 'spotify',
							dspReportIds: ['spotify-us'],
						},
					],
				},
			},
		);

		expect(result).toEqual([
			{
				pgDspId: 'spotify',
				dspReportId: 'spotify-us',
				dspReportIds: ['spotify-us'],
				dspName: 'Spotify',
				imageUrl: null,
				revenueUsd: 12.5,
				revenueUsdExact: '12.5',
				quantity: 10,
			},
		]);
		const barQuery = query.mock.calls
			.map(([sql]) => sql as string)
			.find((sql) => sql.includes('GROUP BY if'));
		expect(barQuery).toContain('ORDER BY quantity DESC');
		for (const [, params] of query.mock.calls) {
			expect(params).toMatchObject({
				dspPgId0: 'spotify',
				from: '2026-01-01',
				to: '2026-02-01',
			});
		}
	});
});
