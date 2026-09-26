import { ForbiddenException } from '@nestjs/common';
import { SYSTEM_TENANT_ID } from 'src/modules/tenant/tenant.constant';
import {
	buildAnalyticsSeriesFilters,
	resolveAnalyticsSeriesBy,
} from './analytics-series-filter.util';

describe('analytics series filters', () => {
	const baseQuery = {
		fromDate: '2026-01-01',
		toDate: '2026-01-31',
	};

	it('uses the smallest selected content dimension as the automatic series key', () => {
		expect(
			resolveAnalyticsSeriesBy({
				...baseQuery,
				filters: {
					tenantIds: ['11111111-1111-4111-8111-111111111111'],
					releaseIds: ['22222222-2222-4222-8222-222222222222'],
					isrcs: ['USAAA2600001', 'USAAA2600002'],
				},
			}),
		).toEqual({
			seriesBy: 'isrc',
			seriesIds: ['USAAA2600001', 'USAAA2600002'],
		});
	});

	it('intersects arrays and leaves an empty intersection to ClickHouse', () => {
		const result = buildAnalyticsSeriesFilters(
			SYSTEM_TENANT_ID,
			{
				...baseQuery,
				filters: {
					tenantIds: [
						'11111111-1111-4111-8111-111111111111',
						'22222222-2222-4222-8222-222222222222',
					],
					releaseIds: ['33333333-3333-4333-8333-333333333333'],
				},
			},
			'trend',
		);

		expect(result.filterSql).toContain('IN ({tenantIds:Array(String)})');
		expect(result.filterSql).toContain('IN ({releaseIds:Array(String)})');
		expect(result.params).toMatchObject({
			tenantIds: [
				'11111111-1111-4111-8111-111111111111',
				'22222222-2222-4222-8222-222222222222',
			],
			releaseIds: ['33333333-3333-4333-8333-333333333333'],
		});
		expect(result.seriesBy).toBe('release');
	});

	it('prioritizes pg DSP and falls back to raw report IDs', () => {
		const result = buildAnalyticsSeriesFilters(
			SYSTEM_TENANT_ID,
			{
				...baseQuery,
				filters: {
					dspIds: [
						{
							pgDspId: 'spotify',
							dspReportIds: ['ignored-report'],
						},
						{ dspReportIds: ['apple-us'] },
					],
				},
			},
			'trend',
		);

		expect(result.seriesBy).toBe('dsp');
		expect(result.seriesIds).toEqual([
			'spotify',
			'apple-us',
		]);
		expect(result.filterSql).toContain(
			'r.pg_uuid = {dspPgId0:String}',
		);
		expect(result.params).toMatchObject({
			dspPgId0: 'spotify',
			dspReportIds1: ['apple-us'],
		});
		expect(result.params).not.toHaveProperty('dspReportId0');
		expect(result.filterSql).toContain(
			's.dsp_id IN ({dspReportIds1:Array(String)})',
		);
	});

	it('keeps tenant authorization strict for non-system tenants', () => {
		expect(() =>
			buildAnalyticsSeriesFilters(
				'11111111-1111-4111-8111-111111111111',
				{
					...baseQuery,
					filters: {
						tenantIds: ['22222222-2222-4222-8222-222222222222'],
					},
				},
				'trend',
			),
		).toThrow(ForbiddenException);
	});
});
