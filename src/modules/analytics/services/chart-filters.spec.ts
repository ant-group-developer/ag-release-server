import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { SYSTEM_TENANT_ID } from 'src/modules/tenant/tenant.constant';
import { RevenueChartQueryDto } from '../dto/analytics-query.dto';
import { AnalyticsCacheService } from './analytics-cache.service';
import { DspAnalyticsService } from './dsp-analytics.service';
import { EntityAnalyticsService, EntityType } from './entity-analytics.service';
import { TimelineAnalyticsService } from './global-timeline.service';
import { TerAnalyticsService } from './ter-analytics.service';

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
const entityPredicates: Record<EntityType, string> = {
	artist: 'has(t.artist_ids, {entityId:String})',
	label: "coalesce(nullIf(o.label_id, ''), t.label_id) = {entityId:String}",
	release: 't.release_id = {entityId:String}',
	track: 's.isrc = {entityId:String}',
	tenant: "coalesce(nullIf(o.tenant_id, ''), t.tenant_id) = {entityId:String}",
	channel: 't.channel_id = {entityId:String}',
	sourceType: 's.import_source = {entityId:String}',
};

function setup() {
	const clickhouse = { query: jest.fn().mockResolvedValue([]) };
	const manager = { query: jest.fn().mockResolvedValue([]) };
	const cache = new AnalyticsCacheService();
	return {
		clickhouse,
		entity: new EntityAnalyticsService(
			clickhouse as never,
			manager as never,
			cache,
			{} as never,
		),
		dsp: new DspAnalyticsService(
			clickhouse as never,
			manager as never,
			cache,
		),
		territory: new TerAnalyticsService(
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
		expect(sql).toContain(predicate);
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

describe('entity chart filters', () => {
	it.each(
		(Object.keys(entityPredicates) as EntityType[]).flatMap((entity) =>
			chartMethods.map((method) => [entity, method] as const),
		),
	)(
		'%s / %s intersects body filters with the URL entity in every query',
		async (entityType, method) => {
			const { entity, clickhouse } = setup();
			await entity[method](
				entityType,
				'url-entity',
				filters,
				SYSTEM_TENANT_ID,
			);
			expect(clickhouse.query).toHaveBeenCalledTimes(
				method.includes('Bar') ? 2 : 1,
			);
			for (const [sql, params] of clickhouse.query.mock.calls) {
				expectFullFilters(sql, params, method.includes('Revenue'));
				expect(sql).toContain(entityPredicates[entityType]);
				expect(params.entityId).toBe('url-entity');
				expect(params.from).toBe(
					method.includes('Revenue') ? '2026-01-01' : dates.fromDate,
				);
				expect(params.to).toBe(
					method.includes('Revenue') ? '2026-02-01' : dates.toDate,
				);
			}
			if (method.includes('Revenue') && method.includes('Bar')) {
				expect(clickhouse.query.mock.calls[1][0]).toContain(
					'ORDER BY quantity DESC',
				);
			}
		},
	);

	it.each([
		'labelId',
		'releaseId',
		'artistId',
		'channelId',
		'tenantId',
		'isrc',
		'pgDspId',
		'dspReportId',
		'releaseType',
		'importSource',
	] as const)(
		'applies %s by itself on system track charts, including the no-join path',
		async (field) => {
			const { entity, clickhouse } = setup();
			await entity.getRevenueLineChart(
				'track',
				'url-isrc',
				{ ...dates, [field]: filters[field] },
				SYSTEM_TENANT_ID,
			);
			const [sql, params] = clickhouse.query.mock.calls[0];
			if (field === 'dspReportId') {
				expect(sql).toContain('s.dsp_id = {dspReportId:String}');
				expect(params.dspReportId).toBe(filters.dspReportId);
			} else {
				const [predicate, key] = expectedFilters.find(
					([, , value]) => value === filters[field],
				)!;
				expect(sql).toContain(predicate);
				expect(params[key]).toBe(filters[field]);
			}
		},
	);

	it('keeps tenant access constraints while applying label filters', async () => {
		const { entity, clickhouse } = setup();
		await entity.getRevenueLineChart(
			'artist',
			'artist-a',
			{ ...dates, labelId: 'label-a' },
			'tenant-a',
		);
		expect(clickhouse.query.mock.calls[0][1]).toMatchObject({
			detailTenantId: 'tenant-a',
			detailLabelId: 'label-a',
		});
		await expect(
			entity.getRevenueLineChart(
				'artist',
				'artist-a',
				{ ...dates, tenantId: 'tenant-b' },
				'tenant-a',
			),
		).rejects.toBeInstanceOf(ForbiddenException);
		expect(clickhouse.query).toHaveBeenCalledTimes(1);
	});

	it('allows the tenant target already authorized by the controller', async () => {
		const { entity, clickhouse } = setup();
		await entity.getRevenueLineChart(
			'tenant',
			'child-tenant',
			{ ...dates, tenantId: 'child-tenant', labelId: 'label-a' },
			'parent-tenant',
		);
		expect(clickhouse.query.mock.calls[0][1]).toMatchObject({
			entityId: 'child-tenant',
			detailTenantId: 'child-tenant',
			detailLabelId: 'label-a',
		});
	});

	it.each(chartMethods.filter((method) => method.includes('Bar')))(
		'%s derives Other from the filtered grand total',
		async (method) => {
			const { entity, clickhouse } = setup();
			clickhouse.query
				.mockResolvedValueOnce([
					{ total_views: '30', total_rev: '12.5', total_qty: '30' },
				])
				.mockResolvedValueOnce([
					{
						total_views: '20',
						revenue_usd: '10',
						quantity: '20',
						territory: 'US',
						dsp_name: 'DSP',
						dsp_report_id: 'raw',
						dsp_report_ids: ['raw'],
					},
				]);
			const items = await entity[method](
				'artist',
				'artist-a',
				filters,
				SYSTEM_TENANT_ID,
			);
			const other = items[items.length - 1];
			expect(other).toMatchObject(
				method.includes('Revenue')
					? { revenueUsd: 2.5, quantity: 10 }
					: { totalViews: 10 },
			);
			for (const [sql, params] of clickhouse.query.mock.calls)
				expectFullFilters(sql, params, method.includes('Revenue'));
		},
	);
});

describe('territory chart filters', () => {
	it.each(['getTrendViewLineChart', 'getRevenueLineChart'] as const)(
		'%s includes all DTO filters and territory',
		async (method) => {
			const { territory, clickhouse } = setup();
			await territory[method]('vn', filters, SYSTEM_TENANT_ID);
			const [sql, params] = clickhouse.query.mock.calls[0];
			expectFullFilters(sql, params, method.includes('Revenue'));
			expect(sql).toContain('s.territory_code = {isoCode:String}');
			expect(params.isoCode).toBe('VN');
		},
	);

	it('isolates the query and cache by authenticated tenant', async () => {
		const { territory, clickhouse } = setup();
		await territory.getRevenueLineChart('VN', dates, 'tenant-a');
		await territory.getRevenueLineChart('VN', dates, 'tenant-b');
		expect(clickhouse.query).toHaveBeenCalledTimes(2);
		expect(clickhouse.query.mock.calls[0][1].detailTenantId).toBe(
			'tenant-a',
		);
		expect(clickhouse.query.mock.calls[1][1].detailTenantId).toBe(
			'tenant-b',
		);
	});
});

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
