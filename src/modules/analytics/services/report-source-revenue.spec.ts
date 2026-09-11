import { SYSTEM_TENANT_ID } from 'src/modules/tenant/tenant.constant';
import { AnalyticsCacheService } from './analytics-cache.service';
import { TimelineAnalyticsService } from './global-timeline.service';

describe('Revenue source totals for reports with missing identifiers', () => {
	it.each([false, true])(
		'keeps track/ownership restrictions only for tenant scope: %s',
		async (restricted) => {
			const db = { query: jest.fn().mockResolvedValue([]) };
			const service = new TimelineAnalyticsService(
				db as never,
				{} as never,
				{} as never,
				new AnalyticsCacheService(),
				{} as never,
			);
			await service.getRevenueTopSourceType(
				restricted ? 'tenant-a' : SYSTEM_TENANT_ID,
				{
					fromDate: '2025-08-01',
					toDate: '2026-01-31',
					importSource: 'audio_salad_report',
				} as never,
			);
			for (const [sql, params] of db.query.mock.calls) {
				expect(sql).toContain(
					's.import_source = {detailImportSource:String}',
				);
				expect(params.detailImportSource).toBe('audio_salad_report');
				if (restricted) {
					expect(sql).toContain('INNER JOIN');
					expect(params.detailTenantId).toBe('tenant-a');
				} else {
					expect(sql).not.toContain('INNER JOIN');
					expect(sql).not.toContain('t.is_deleted');
				}
			}
		},
	);
	it('does not repopulate invalidated cache from an older in-flight query', async () => {
		const cache = new AnalyticsCacheService();
		let finish!: (value: { old: boolean }) => void;
		const old = cache.wrap(
			'key',
			() =>
				new Promise<{ old: boolean }>((resolve) => {
					finish = resolve;
				}),
		);
		cache.clear();
		await cache.wrap('key', async () => ({ old: false }));
		finish({ old: true });
		await old;
		expect(cache.get('key')).toEqual({ old: false });
	});
});
