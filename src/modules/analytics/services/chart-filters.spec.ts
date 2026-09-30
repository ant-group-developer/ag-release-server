import { BadRequestException } from '@nestjs/common';
import { SYSTEM_TENANT_ID } from 'src/modules/tenant/tenant.constant';
import {
	RevenueChartQueryDto,
	TimelineQueryDto,
} from '../dto/analytics-query.dto';
import { AnalyticsCacheService } from './analytics-cache.service';
import { DspAnalyticsService } from './dsp-analytics.service';
import { TimelineAnalyticsService } from './global-timeline.service';

const dates = { fromDate: '2026-01-12', toDate: '2026-02-20' };
const filters: RevenueChartQueryDto = {
	...dates,
	labelId: 'label-filter',
	releaseId: 'release-filter',
	artistId: 'artist-filter',
	channelId: 'channel-filter',
	tenantId: 'tenant-filter',
	isrc: 'ISRC-FILTER',
	pgDspId: 'mapped-dsp',
	dspReportId: 'ignored-raw-dsp',
	releaseType: 'video',
	importSource: 'vevo',
	analyticsVideoScope: { allowedChannelIds: ['channel-filter'] },
	granularity: 'month',
	sortBy: 'usage',
};
const expectedFilters = [
	[
		"coalesce(nullIf(o.label_id, ''), t.label_id) = {detailLabelId:String}",
		'detailLabelId',
		filters.labelId,
	],
	[
		't.release_id = {detailReleaseId:String}',
		'detailReleaseId',
		filters.releaseId,
	],
	['has(t.artist_ids, {artistId:String})', 'artistId', filters.artistId],
	['t.channel_id = {channelId:String}', 'channelId', filters.channelId],
	[
		"coalesce(nullIf(o.tenant_id, ''), t.tenant_id) = {detailTenantId:String}",
		'detailTenantId',
		filters.tenantId,
	],
	['s.isrc = {isrc:String}', 'isrc', filters.isrc],
	['pg_uuid = {pgDspId:String}', 'pgDspId', filters.pgDspId],
	[
		't.release_type = {detailReleaseType:String}',
		'detailReleaseType',
		filters.releaseType,
	],
	[
		's.import_source = {detailImportSource:String}',
		'detailImportSource',
		filters.importSource,
	],
] as const;

const chartMethods = [
	'getTrendViewLineChart',
	'getRevenueLineChart',
	'getTrendViewDspBarChart',
	'getTrendViewTerritoryBarChart',
	'getRevenueDspBarChart',
	'getRevenueTerritoryBarChart',
] as const;

function setup() {
	const clickhouse = { query: jest.fn().mockResolvedValue([]) };
	const manager = { query: jest.fn().mockResolvedValue([]) };
	const cache = new AnalyticsCacheService();
	return {
		clickhouse,
		dsp: new DspAnalyticsService(
			clickhouse as never,
			manager as never,
			cache,
		),
	};
}

function expectFullFilters(
	sql: string,
	params: Record<string, unknown>,
	revenue: boolean,
) {
	for (const [predicate, key, value] of expectedFilters) {
		const expectedPredicate = revenue
			? predicate
					.replace(
						"coalesce(nullIf(o.label_id, ''), t.label_id)",
						"coalesce(nullIf(o.label_id, ''), nullIf(t.label_id, ''), nullIf(s.ingest_label_id, ''))",
					)
					.replace(
						"coalesce(nullIf(o.tenant_id, ''), t.tenant_id)",
						"coalesce(nullIf(o.tenant_id, ''), nullIf(t.tenant_id, ''), nullIf(s.ingest_tenant_id, ''))",
					)
			: predicate;
		expect(sql).toContain(expectedPredicate);
		expect(params[key]).toEqual(value);
	}
	expect(sql).toContain(
		't.channel_id IN ({analyticsAllowedChannelIds:Array(String)})',
	);
	expect(params.analyticsAllowedChannelIds).toEqual(['channel-filter']);
	expect(sql).not.toContain('{dspReportId:String}');
	expect(params).not.toHaveProperty('dspReportId');
	expect(sql).toContain(
		revenue
			? 's.period >= o.revenue_effective_from'
			: 's.reporting_date >= o.effective_from',
	);
	expect(sql).toContain('o.isrc !=');
}

describe('DSP chart filters', () => {
	it.each([
		'getTrendViewLineChart',
		'getRevenueLineChart',
		'getTrendViewTerritoryBarChart',
		'getRevenueTerritoryBarChart',
	] as const)(
		'%s prioritizes pgDspId when both DSP IDs are sent',
		async (method) => {
			const { dsp, clickhouse } = setup();
			await dsp[method](
				{
					...dates,
					pgDspId: 'mapped',
					dspReportId: 'raw',
					releaseType: 'video',
				},
				SYSTEM_TENANT_ID,
			);
			for (const [sql, params] of clickhouse.query.mock.calls) {
				expect(sql).toContain('pg_uuid = {pgDspId:String}');
				expect(sql).not.toContain('{dspReportId:String}');
				expect(params).toMatchObject({
					pgDspId: 'mapped',
					detailReleaseType: 'video',
				});
			}
		},
	);

	it('supports raw DSP IDs and rejects missing DSP selection', async () => {
		const { dsp, clickhouse } = setup();
		await dsp.getRevenueLineChart(
			{ ...dates, dspReportId: 'raw' },
			SYSTEM_TENANT_ID,
		);
		expect(clickhouse.query.mock.calls[0][0]).toContain(
			's.dsp_id = {dspReportId:String}',
		);
		await expect(
			dsp.getRevenueLineChart(dates, SYSTEM_TENANT_ID),
		).rejects.toBeInstanceOf(BadRequestException);
	});
});

describe('global chart filter regression', () => {
	it('getTrendsOverview includes the ownership join required by tenant filters', async () => {
		const { clickhouse } = setup();
		const service = new TimelineAnalyticsService(
			clickhouse as never,
			{} as never,
			{} as never,
			new AnalyticsCacheService(),
			{} as never,
		);

		await service.getTrendsOverview(
			SYSTEM_TENANT_ID,
			Object.assign(new TimelineQueryDto(), filters),
		);

		expect(clickhouse.query).toHaveBeenCalledTimes(2);
		for (const [sql, params] of clickhouse.query.mock.calls) {
			expectFullFilters(sql, params, false);
			expect(sql).toContain('AS o ON s.isrc = o.isrc');
		}
	});

	it.each(chartMethods)(
		'%s retains the full filter set after sharing the builder',
		async (method) => {
			const { clickhouse } = setup();
			const service = new TimelineAnalyticsService(
				clickhouse as never,
				{} as never,
				{} as never,
				new AnalyticsCacheService(),
				{} as never,
			);
			await service[method](SYSTEM_TENANT_ID, filters);
			for (const [sql, params] of clickhouse.query.mock.calls)
				expectFullFilters(sql, params, method.includes('Revenue'));
		},
	);
});
