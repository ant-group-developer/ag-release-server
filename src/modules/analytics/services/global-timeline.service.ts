import { Injectable, Logger } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { CLICKHOUSE_TABLES } from 'src/modules/clickhouse/clickhouse.constants';
import { ClickHouseService } from 'src/modules/clickhouse/clickhouse.service';
import { checkIsSystemTenant } from 'src/modules/user/utils/user-type.util';
import { normalizeDateToFirstOfMonth } from 'src/utils/util.date';
import { EntityManager } from 'typeorm';
import { getImportSourceLabel } from '../constants/import-source.constants';
import { ChartQueryDto, TimelineQueryDto } from '../dto/analytics-query.dto';
import {
	AnalyticsChannelInfo,
	AnalyticsWorkspaceInfo,
	DspBarChartItem,
	DspTimelinePeriod,
	DspTimelineResponse,
	OverviewTrendsResponse,
	RevenueArtistItem,
	RevenueChannelItem,
	RevenueDspItem,
	RevenueLabelItem,
	RevenueLineChartItem,
	RevenueOverviewResponse,
	RevenueReleaseItem,
	RevenueReleaseVideoItem,
	RevenueSourceTypeItem,
	RevenueTenantItem,
	RevenueTimelineResponse,
	RevenueTrackItem,
	SourceBreakdownItem,
	TerritoryBarChartItem,
	TerTimelinePeriod,
	TerTimelineResponse,
	TrendViewLineChartItem,
} from '../interfaces/analytics.interface';
import * as queries from '../queries/global-timeline.queries';
import { normalizeSyncedMetadataExternal } from '../utils/metadata-external.util';
import { AnalyticsCacheService } from './analytics-cache.service';
import { IsrcResolverService } from './isrc-resolver.service';

@Injectable()
export class TimelineAnalyticsService {
	private readonly logger = new Logger(TimelineAnalyticsService.name);
	// Audio: yeu cau release_upc chuan (10-14 chu so sau khi strip leading zeros).
	// Video: bypass filter - luon cho pass du release_upc dang placeholder (ISRC-xxx).
	private readonly validReleaseUpcFilter =
		"AND (t.release_type = 'video' OR match(replaceRegexpOne(t.release_upc, '^0+', ''), '^[0-9]{10,14}$'))";

	constructor(
		private readonly clickHouseService: ClickHouseService,
		private readonly isrcResolverService: IsrcResolverService,
		@InjectEntityManager()
		private readonly entityManager: EntityManager,
		private readonly cache: AnalyticsCacheService,
	) {}

	private revenueNumber(value?: string | null): number {
		return Number(value ?? 0);
	}

	private revenueExact(value?: string | null): string {
		return value?.toString() ?? '0';
	}

	private addRevenueExact(values: Array<string | null | undefined>): string {
		const decimals = values.map((value) => this.revenueExact(value));
		const scale = Math.max(
			0,
			...decimals.map((value) => (value.split('.')[1] || '').length),
		);
		let sum = 0n;

		for (const value of decimals) {
			const negative = value.trim().startsWith('-');
			const unsigned = negative ? value.trim().slice(1) : value.trim();
			const [whole = '0', frac = ''] = unsigned.split('.');
			const units = BigInt(
				`${whole || '0'}${frac.padEnd(scale, '0') || ''}`,
			);
			sum += negative ? -units : units;
		}

		const negative = sum < 0n;
		const abs = negative ? -sum : sum;
		if (scale === 0) return `${negative ? '-' : ''}${abs.toString()}`;

		const padded = abs.toString().padStart(scale + 1, '0');
		const whole = padded.slice(0, -scale) || '0';
		const frac = padded.slice(-scale).replace(/0+$/, '');
		return `${negative ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
	}

	private subtractRevenueExact(
		left?: string | null,
		right?: string | null,
	): string {
		const rightValue = this.revenueExact(right);
		return this.addRevenueExact([
			left,
			rightValue.startsWith('-') ? rightValue.slice(1) : `-${rightValue}`,
		]);
	}

	/**
	 * Fetch breakdown by import_source cho 1 group key (dsp, artist, track, label...).
	 * groupFilter: SQL fragment thêm vào WHERE để scope về 1 entity (e.g. "AND s.dsp_id = 'xxx'")
	 * groupParams: params tương ứng
	 * includeRevenue: true cho sales cube, false cho trends cube
	 */
	private async fetchSourceBreakdown(
		table: string,
		dateCol: string,
		joinSql: string,
		baseFilterSql: string,
		baseParams: Record<string, any>,
		groupFilter: string,
		groupParams: Record<string, any>,
		includeRevenue: boolean,
	): Promise<SourceBreakdownItem[]> {
		const params = { ...baseParams, ...groupParams };
		const revSelect = includeRevenue
			? ', sum(s.total_revenue_usd) AS revenue_usd'
			: '';
		const sql = `
      SELECT
        s.import_source AS source,
        sum(s.total_quantity) AS quantity
        ${revSelect}
      FROM ${table} s
      ${joinSql}
      WHERE ${dateCol} >= toDate({from:String}) AND ${dateCol} <= toDate({to:String})
        ${baseFilterSql} ${groupFilter}
      GROUP BY s.import_source
      ORDER BY quantity DESC
    `;
		const rows = await this.clickHouseService.query<{
			source: string;
			quantity: string;
			revenue_usd?: string;
		}>(sql, params);
		return rows.map((r) => ({
			source: r.source,
			sourceLabel: getImportSourceLabel(r.source),
			quantity: Number(r.quantity),
			...(includeRevenue && {
				revenueUsd: this.revenueNumber(r.revenue_usd),
				revenueUsdExact: this.revenueExact(r.revenue_usd),
			}),
		}));
	}

	// ═══════════════════════════════════════════════════════
	// Helper: Xay dung menh de WHERE cho phan quyen Tenant
	// System-tenant không có sub-filter → bỏ JOIN pg_tracks_sync
	// để thống kê TẤT CẢ ISRCs trong ClickHouse
	// ═══════════════════════════════════════════════════════
	private buildTenantFilters(
		tenantId: string,
		query: {
			labelId?: string;
			releaseId?: string;
			releaseType?: 'audio' | 'video';
			importSource?: string;
		},
	): { joinSql: string; filterSql: string; params: Record<string, any> } {
		const params: Record<string, any> = {};
		let filterSql = '';

		const isSystem = checkIsSystemTenant(tenantId);
		const hasSubFilter = !!(
			query.labelId ||
			query.releaseId ||
			query.releaseType
		);

		// System-tenant WITHOUT sub-filters → skip pg_tracks_sync JOIN entirely
		if (isSystem && !hasSubFilter) {
			if (query.importSource) {
				filterSql += ' AND s.import_source = {importSource:String}';
				params.importSource = query.importSource;
			}
			return { joinSql: '', filterSql, params };
		}

		// All other cases: JOIN pg_tracks_sync for tenant/label/release filtering
		const joinSql = `INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc`;
		filterSql += ' AND t.is_deleted = 0';

		if (!isSystem) {
			filterSql += ' AND t.tenant_id = {tenantId:String}';
			params.tenantId = tenantId;
		}

		if (query.labelId) {
			filterSql += ' AND t.label_id = {labelId:String}';
			params.labelId = query.labelId;
		}

		if (query.releaseId) {
			filterSql += ' AND t.release_id = {releaseId:String}';
			params.releaseId = query.releaseId;
		}

		if (query.releaseType) {
			filterSql += ' AND t.release_type = {releaseType:String}';
			params.releaseType = query.releaseType;
		}

		if (query.importSource) {
			filterSql += ' AND s.import_source = {importSource:String}';
			params.importSource = query.importSource;
		}

		return { joinSql, filterSql, params };
	}

	// ═══════════════════════════════════════════════════════
	// DSP SALES TIMELINE (Có Doanh thu + Lượt nghe đối soát)
	// ═══════════════════════════════════════════════════════
	async getDspSalesTimeline(
		tenantId: string,
		query: TimelineQueryDto,
	): Promise<DspTimelineResponse> {
		const key = this.cache.buildKey('tl:dsp-sales', tenantId, query);
		return this.cache.wrap(key, () =>
			this.computeDspSalesTimeline(tenantId, query),
		);
	}

	private async computeDspSalesTimeline(
		tenantId: string,
		query: TimelineQueryDto,
	): Promise<DspTimelineResponse> {
		const fromDate = normalizeDateToFirstOfMonth(query.fromDate);
		const toDate = normalizeDateToFirstOfMonth(query.toDate);
		const { topN = 5, includeOther = true } = query;
		const { joinSql, filterSql, params } = this.buildTenantFilters(
			tenantId,
			query,
		);
		params.from = fromDate;
		params.to = toDate;

		// DSP name: chua assign → dsps_report.dsp_name, da assign → pg_dsps_sync.dsp_name
		const resolvedDspName = `coalesce(nullIf(p.dsp_name, ''), nullIf(r.dsp_name, ''), s.dsp_id)`;
		const dspNameExpr = `${resolvedDspName} AS dsp_name`;
		const joinExpr = `
      LEFT JOIN (SELECT * FROM music_analytics.dsps_report FINAL) r ON s.dsp_id = r.id_dsps_report
      LEFT JOIN (SELECT * FROM music_analytics.pg_dsps_sync FINAL) p ON r.pg_uuid = p.pg_uuid
    `;

		// 1. Tim Top N DSPs dua tren views cua tenant
		const topDspsSql = queries.getDspSalesTimelineTopDspsQuery(
			joinSql,
			joinExpr,
			filterSql,
			resolvedDspName,
			topN,
		);
		const topDspsRows = await this.clickHouseService.query<{
			dsp_id: string;
			dsp_name: string;
		}>(topDspsSql, params);
		const topDspIds = topDspsRows.map((r) => r.dsp_id);
		const topDsps = topDspsRows.map((r) => r.dsp_name);

		if (!topDspIds.length) {
			return { topDsps: [], items: [] };
		}

		// 2. Query monthly timeline native JOIN
		params.topDsps = topDspIds;
		const dspExpr = includeOther
			? `multiIf(s.dsp_id IN ({topDsps:Array(String)}), ${resolvedDspName}, 'Other') AS dsp_name`
			: dspNameExpr;
		const whereDsp = includeOther
			? ''
			: 'AND s.dsp_id IN ({topDsps:Array(String)})';

		const timelineSql = queries.getDspSalesTimelineQuery(
			joinSql,
			joinExpr,
			filterSql,
			dspExpr,
			whereDsp,
		);

		const rows = await this.clickHouseService.query<{
			period_str: string;
			dsp_name: string;
			sales_views: string;
			revenue_usd: string;
		}>(timelineSql, params);

		// Group ket qua
		const periodMap = new Map<string, DspTimelinePeriod>();
		for (const row of rows) {
			let period = periodMap.get(row.period_str);
			if (!period) {
				period = { period: row.period_str, series: [] };
				periodMap.set(row.period_str, period);
			}
			period.series.push({
				dsp: row.dsp_name,
				salesViews: Number(row.sales_views),
				revenueUsd: this.revenueNumber(row.revenue_usd),
				revenueUsdExact: this.revenueExact(row.revenue_usd),
			});
		}

		return { topDsps, items: Array.from(periodMap.values()) };
	}

	// ═══════════════════════════════════════════════════════
	// DSP TRENDS TIMELINE (Lượt nghe hàng ngày xu hướng)
	// ═══════════════════════════════════════════════════════
	async getDspTrendsTimeline(
		tenantId: string,
		query: TimelineQueryDto,
	): Promise<DspTimelineResponse> {
		const key = this.cache.buildKey('tl:dsp-trends', tenantId, query);
		return this.cache.wrap(key, () =>
			this.computeDspTrendsTimeline(tenantId, query),
		);
	}

	private async computeDspTrendsTimeline(
		tenantId: string,
		query: TimelineQueryDto,
	): Promise<DspTimelineResponse> {
		const fromDate = normalizeDateToFirstOfMonth(query.fromDate);
		const toDate = normalizeDateToFirstOfMonth(query.toDate);
		const { topN = 5, includeOther = true } = query;
		const { joinSql, filterSql, params } = this.buildTenantFilters(
			tenantId,
			query,
		);
		params.from = fromDate;
		params.to = toDate;

		// DSP name: chua assign -> dsps_report.dsp_name, da assign -> pg_dsps_sync.dsp_name
		const resolvedDspName = `coalesce(nullIf(p.dsp_name, ''), nullIf(r.dsp_name, ''), s.dsp_id)`;
		const dspNameExpr = `${resolvedDspName} AS dsp_name`;
		const joinExpr = `
      LEFT JOIN (SELECT * FROM music_analytics.dsps_report FINAL) r ON s.dsp_id = r.id_dsps_report
      LEFT JOIN (SELECT * FROM music_analytics.pg_dsps_sync FINAL) p ON r.pg_uuid = p.pg_uuid
    `;

		// 1. Tim Top N DSPs trends
		const topDspsSql = queries.getDspTrendsTimelineTopDspsQuery(
			joinSql,
			joinExpr,
			filterSql,
			resolvedDspName,
			topN,
		);
		const topDspsRows = await this.clickHouseService.query<{
			dsp_id: string;
			dsp_name: string;
		}>(topDspsSql, params);
		const topDspIds = topDspsRows.map((r) => r.dsp_id);
		const topDsps = topDspsRows.map((r) => r.dsp_name);

		if (!topDspIds.length) {
			return { topDsps: [], items: [] };
		}

		// 2. Query timeline
		params.topDsps = topDspIds;
		const dspExpr = includeOther
			? `multiIf(s.dsp_id IN ({topDsps:Array(String)}), ${resolvedDspName}, 'Other') AS dsp_name`
			: dspNameExpr;
		const whereDsp = includeOther
			? ''
			: 'AND s.dsp_id IN ({topDsps:Array(String)})';

		const timelineSql = queries.getDspTrendsTimelineQuery(
			joinSql,
			joinExpr,
			filterSql,
			dspExpr,
			whereDsp,
		);

		const rows = await this.clickHouseService.query<{
			period_str: string;
			dsp_name: string;
			trend_views: string;
		}>(timelineSql, params);

		const periodMap = new Map<string, DspTimelinePeriod>();
		for (const row of rows) {
			let period = periodMap.get(row.period_str);
			if (!period) {
				period = { period: row.period_str, series: [] };
				periodMap.set(row.period_str, period);
			}
			period.series.push({
				dsp: row.dsp_name,
				trendViews: Number(row.trend_views),
			});
		}

		return { topDsps, items: Array.from(periodMap.values()) };
	}

	// ═══════════════════════════════════════════════════════
	// DSP TRENDS DAILY TIMELINE (Lượt nghe hàng ngày xu hướng)
	// ═══════════════════════════════════════════════════════
	async getDspTrendsDailyTimeline(
		tenantId: string,
		query: TimelineQueryDto,
	): Promise<DspTimelineResponse> {
		const key = this.cache.buildKey('tl:dsp-trends-daily', tenantId, query);
		return this.cache.wrap(key, () =>
			this.computeDspTrendsDailyTimeline(tenantId, query),
		);
	}

	private async computeDspTrendsDailyTimeline(
		tenantId: string,
		query: TimelineQueryDto,
	): Promise<DspTimelineResponse> {
		const { fromDate, toDate, topN = 5, includeOther = true } = query;
		const { joinSql, filterSql, params } = this.buildTenantFilters(
			tenantId,
			query,
		);
		params.from = fromDate;
		params.to = toDate;

		const joinExpr = `
      LEFT JOIN (SELECT * FROM music_analytics.dsps_report FINAL) r ON s.dsp_id = r.id_dsps_report
      LEFT JOIN (SELECT * FROM music_analytics.pg_dsps_sync FINAL) p ON r.pg_uuid = p.pg_uuid
    `;

		const resolvedDspName = `coalesce(nullIf(p.dsp_name, ''), nullIf(r.dsp_name, ''), s.dsp_id)`;
		const dspNameExpr = `${resolvedDspName} AS dsp_name`;

		// 1. Tim Top N DSPs trends daily
		const topDspsSql = queries.getDspTrendsDailyTimelineTopDspsQuery(
			joinSql,
			joinExpr,
			filterSql,
			resolvedDspName,
			topN,
		);
		const topDspsRows = await this.clickHouseService.query<{
			dsp_id: string;
			dsp_name: string;
		}>(topDspsSql, params);
		const topDspIds = topDspsRows.map((r) => r.dsp_id);
		const topDsps = topDspsRows.map((r) => r.dsp_name);

		if (!topDspIds.length) {
			return { topDsps: [], items: [] };
		}

		// 2. Query daily timeline
		params.topDsps = topDspIds;
		const dspExpr = includeOther
			? `multiIf(s.dsp_id IN ({topDsps:Array(String)}), ${resolvedDspName}, 'Other') AS dsp_name`
			: dspNameExpr;
		const whereDsp = includeOther
			? ''
			: 'AND s.dsp_id IN ({topDsps:Array(String)})';

		const timelineSql = queries.getDspTrendsDailyTimelineQuery(
			joinSql,
			joinExpr,
			filterSql,
			dspExpr,
			whereDsp,
		);

		const rows = await this.clickHouseService.query<{
			period_str: string;
			dsp_name: string;
			trend_views: string;
		}>(timelineSql, params);

		const periodMap = new Map<string, DspTimelinePeriod>();
		for (const row of rows) {
			let period = periodMap.get(row.period_str);
			if (!period) {
				period = { period: row.period_str, series: [] };
				periodMap.set(row.period_str, period);
			}
			period.series.push({
				dsp: row.dsp_name,
				trendViews: Number(row.trend_views),
			});
		}

		return { topDsps, items: Array.from(periodMap.values()) };
	}

	// ═══════════════════════════════════════════════════════
	// TERRITORY SALES TIMELINE
	// ═══════════════════════════════════════════════════════
	async getTerSalesTimeline(
		tenantId: string,
		query: TimelineQueryDto,
	): Promise<TerTimelineResponse> {
		const key = this.cache.buildKey('tl:ter-sales', tenantId, query);
		return this.cache.wrap(key, () =>
			this.computeTerSalesTimeline(tenantId, query),
		);
	}

	private async computeTerSalesTimeline(
		tenantId: string,
		query: TimelineQueryDto,
	): Promise<TerTimelineResponse> {
		const fromDate = normalizeDateToFirstOfMonth(query.fromDate);
		const toDate = normalizeDateToFirstOfMonth(query.toDate);
		const { topN = 5, includeOther = true } = query;
		const { joinSql, filterSql, params } = this.buildTenantFilters(
			tenantId,
			query,
		);
		params.from = fromDate;
		params.to = toDate;

		// 1. Tim Top N Territories
		const topTersSql = queries.getTerSalesTimelineTopTersQuery(
			joinSql,
			filterSql,
			topN,
		);
		const topTersRows = await this.clickHouseService.query<{
			territory: string;
		}>(topTersSql, params);
		const topTerritories = topTersRows.map((r) => r.territory);

		if (!topTerritories.length) {
			return { topTerritories: [], items: [] };
		}

		// 2. Query timeline
		params.topTers = topTerritories;
		const terExpr = includeOther
			? `multiIf(s.territory_code IN ({topTers:Array(String)}), s.territory_code, 'Other')`
			: 's.territory_code';
		const whereTer = includeOther
			? ''
			: 'AND s.territory_code IN ({topTers:Array(String)})';

		const timelineSql = queries.getTerSalesTimelineQuery(
			joinSql,
			filterSql,
			terExpr,
			whereTer,
		);

		const rows = await this.clickHouseService.query<{
			period_str: string;
			ter_name: string;
			sales_views: string;
			revenue_usd: string;
		}>(timelineSql, params);

		const periodMap = new Map<string, TerTimelinePeriod>();
		for (const row of rows) {
			let period = periodMap.get(row.period_str);
			if (!period) {
				period = { period: row.period_str, series: [] };
				periodMap.set(row.period_str, period);
			}
			period.series.push({
				territory: row.ter_name,
				salesViews: Number(row.sales_views),
				revenueUsd: this.revenueNumber(row.revenue_usd),
				revenueUsdExact: this.revenueExact(row.revenue_usd),
			});
		}

		return { topTerritories, items: Array.from(periodMap.values()) };
	}

	// ═══════════════════════════════════════════════════════
	// TERRITORY TRENDS TIMELINE
	// ═══════════════════════════════════════════════════════
	async getTerTrendsTimeline(
		tenantId: string,
		query: TimelineQueryDto,
	): Promise<TerTimelineResponse> {
		const key = this.cache.buildKey('tl:ter-trends', tenantId, query);
		return this.cache.wrap(key, () =>
			this.computeTerTrendsTimeline(tenantId, query),
		);
	}

	private async computeTerTrendsTimeline(
		tenantId: string,
		query: TimelineQueryDto,
	): Promise<TerTimelineResponse> {
		const fromDate = normalizeDateToFirstOfMonth(query.fromDate);
		const toDate = normalizeDateToFirstOfMonth(query.toDate);
		const { topN = 5, includeOther = true } = query;
		const { joinSql, filterSql, params } = this.buildTenantFilters(
			tenantId,
			query,
		);
		params.from = fromDate;
		params.to = toDate;

		// 1. Tim Top N Territories
		const topTersSql = queries.getTerTrendsTimelineTopTersQuery(
			joinSql,
			filterSql,
			topN,
		);
		const topTersRows = await this.clickHouseService.query<{
			territory: string;
		}>(topTersSql, params);
		const topTerritories = topTersRows.map((r) => r.territory);

		if (!topTerritories.length) {
			return { topTerritories: [], items: [] };
		}

		// 2. Query timeline
		params.topTers = topTerritories;
		const terExpr = includeOther
			? `multiIf(s.territory_code IN ({topTers:Array(String)}), s.territory_code, 'Other')`
			: 's.territory_code';
		const whereTer = includeOther
			? ''
			: 'AND s.territory_code IN ({topTers:Array(String)})';

		const timelineSql = queries.getTerTrendsTimelineQuery(
			joinSql,
			filterSql,
			terExpr,
			whereTer,
		);

		const rows = await this.clickHouseService.query<{
			period_str: string;
			ter_name: string;
			trend_views: string;
		}>(timelineSql, params);

		const periodMap = new Map<string, TerTimelinePeriod>();
		for (const row of rows) {
			let period = periodMap.get(row.period_str);
			if (!period) {
				period = { period: row.period_str, series: [] };
				periodMap.set(row.period_str, period);
			}
			period.series.push({
				territory: row.ter_name,
				trendViews: Number(row.trend_views),
			});
		}

		return { topTerritories, items: Array.from(periodMap.values()) };
	}

	// ═══════════════════════════════════════════════════════
	// REVENUE OVERVIEW (Tổng quan doanh thu)
	// ═══════════════════════════════════════════════════════
	async getRevenueOverview(
		tenantId: string,
		query: TimelineQueryDto,
	): Promise<RevenueOverviewResponse> {
		const key = this.cache.buildKey('tl:rev-overview', tenantId, query);
		return this.cache.wrap(key, () =>
			this.computeRevenueOverview(tenantId, query),
		);
	}

	private async computeRevenueOverview(
		tenantId: string,
		query: TimelineQueryDto,
	): Promise<RevenueOverviewResponse> {
		const fromDate = normalizeDateToFirstOfMonth(query.fromDate);
		const toDate = normalizeDateToFirstOfMonth(query.toDate);
		const { joinSql, filterSql, params } = this.buildTenantFilters(
			tenantId,
			query,
		);
		params.from = fromDate;
		params.to = toDate;

		// Truy vấn trên SALES_TER_MONTHLY để lấy cả tổng quantity, tổng USD, và số lượng territory (vùng)
		const sql = queries.getRevenueOverviewQuery(joinSql, filterSql);
		const rows = await this.clickHouseService.query<{
			total_quantity: string;
			total_revenue_usd: string;
			total_territories: string;
		}>(sql, params);

		return {
			totalRevenueUsd: this.revenueNumber(rows[0]?.total_revenue_usd),
			totalRevenueUsdExact: this.revenueExact(rows[0]?.total_revenue_usd),
			totalQuantity: Number(rows[0]?.total_quantity ?? 0),
			totalTerritories: Number(rows[0]?.total_territories ?? 0),
		};
	}

	// ═══════════════════════════════════════════════════════
	// REVENUE TIMELINE (Biểu đồ doanh thu theo chu kỳ tháng + Top DSPs)
	// ═══════════════════════════════════════════════════════
	async getRevenueTimeline(
		tenantId: string,
		query: TimelineQueryDto,
	): Promise<RevenueTimelineResponse> {
		const key = this.cache.buildKey('tl:rev-timeline', tenantId, query);
		return this.cache.wrap(key, () =>
			this.computeRevenueTimeline(tenantId, query),
		);
	}

	private async computeRevenueTimeline(
		tenantId: string,
		query: TimelineQueryDto,
	): Promise<RevenueTimelineResponse> {
		const fromDate = normalizeDateToFirstOfMonth(query.fromDate);
		const toDate = normalizeDateToFirstOfMonth(query.toDate);
		const { topN = 5, includeOther = true } = query;
		const { joinSql, filterSql, params } = this.buildTenantFilters(
			tenantId,
			query,
		);
		params.from = fromDate;
		params.to = toDate;

		// DSP name: ưu tiên pg_dsps_sync → dsps_report → dsp_id gốc
		const resolvedDspName = `coalesce(nullIf(p.dsp_name, ''), nullIf(r.dsp_name, ''), s.dsp_id)`;
		const dspNameExpr = `${resolvedDspName} AS dsp_name`;
		const joinExpr = `
      LEFT JOIN (SELECT * FROM music_analytics.dsps_report FINAL) r ON s.dsp_id = r.id_dsps_report
      LEFT JOIN (SELECT * FROM music_analytics.pg_dsps_sync FINAL) p ON r.pg_uuid = p.pg_uuid
    `;

		// 1. Tìm Top N DSPs theo revenue trong khoảng thời gian
		const topDspsSql = queries.getRevenueTimelineTopDspsQuery(
			joinSql,
			joinExpr,
			filterSql,
			resolvedDspName,
			topN,
		);
		const topDspsRows = await this.clickHouseService.query<{
			dsp_id: string;
			dsp_name: string;
		}>(topDspsSql, params);
		const topDspIds = topDspsRows.map((r) => r.dsp_id);
		const topDsps = topDspsRows.map((r) => r.dsp_name);

		if (!topDspIds.length) {
			return { topDsps: [], items: [] };
		}

		// 2. Query monthly timeline có breakdown theo DSP
		params.topDsps = topDspIds;
		const dspExpr = includeOther
			? `multiIf(s.dsp_id IN ({topDsps:Array(String)}), ${resolvedDspName}, 'Other') AS dsp_name`
			: dspNameExpr;
		const whereDsp = includeOther
			? ''
			: 'AND s.dsp_id IN ({topDsps:Array(String)})';

		const timelineSql = queries.getRevenueTimelineQuery(
			joinSql,
			joinExpr,
			filterSql,
			dspExpr,
			whereDsp,
		);

		const rows = await this.clickHouseService.query<{
			period_str: string;
			dsp_name: string;
			quantity: string;
			revenue_usd: string;
		}>(timelineSql, params);

		// Group kết quả: mỗi period có tổng + series DSP breakdown
		const periodMap = new Map<
			string,
			{
				revenueUsdExactParts: string[];
				quantity: number;
				series: {
					dsp: string;
					revenueUsd: number;
					revenueUsdExact: string;
					quantity: number;
				}[];
			}
		>();
		for (const row of rows) {
			let period = periodMap.get(row.period_str);
			if (!period) {
				period = { revenueUsdExactParts: [], quantity: 0, series: [] };
				periodMap.set(row.period_str, period);
			}
			const revExact = this.revenueExact(row.revenue_usd);
			const rev = this.revenueNumber(row.revenue_usd);
			const qty = Number(row.quantity);
			period.revenueUsdExactParts.push(revExact);
			period.quantity += qty;
			period.series.push({
				dsp: row.dsp_name,
				revenueUsd: rev,
				revenueUsdExact: revExact,
				quantity: qty,
			});
		}

		const items = Array.from(periodMap.entries()).map(([key, val]) => ({
			period: key,
			revenueUsd: this.revenueNumber(
				this.addRevenueExact(val.revenueUsdExactParts),
			),
			revenueUsdExact: this.addRevenueExact(val.revenueUsdExactParts),
			quantity: val.quantity,
			series: val.series,
		}));

		return { topDsps, items };
	}

	private getPaginationParams(query: TimelineQueryDto): {
		limit: number;
		offset: number;
		page: number;
		pageSize: number;
		isPaginated: boolean;
	} {
		if (query.topN !== undefined && query.topN !== null) {
			return {
				limit: query.topN,
				offset: 0,
				page: 1,
				pageSize: query.topN,
				isPaginated: false,
			};
		}

		const page = query.page ?? 1;
		const pageSize = query.pageSize ?? 20;
		return {
			limit: pageSize,
			offset: (page - 1) * pageSize,
			page,
			pageSize,
			isPaginated: true,
		};
	}

	// ═══════════════════════════════════════════════════════
	// REVENUE TOP DSP (Top đối tác theo doanh thu)
	// ═══════════════════════════════════════════════════════
	async getRevenueTopDsp(
		tenantId: string,
		query: TimelineQueryDto,
	): Promise<PageDto<RevenueDspItem>> {
		const key = this.cache.buildKey('tl:rev-top-dsp', tenantId, query);
		return this.cache.wrap(key, () =>
			this.computeRevenueTopDsp(tenantId, query),
		);
	}

	private async computeRevenueTopDsp(
		tenantId: string,
		query: TimelineQueryDto,
	): Promise<PageDto<RevenueDspItem>> {
		const fromDate = normalizeDateToFirstOfMonth(query.fromDate);
		const toDate = normalizeDateToFirstOfMonth(query.toDate);
		const { limit, offset, page, pageSize, isPaginated } =
			this.getPaginationParams(query);
		const {
			joinSql,
			filterSql: baseFilterSql,
			params,
		} = this.buildTenantFilters(tenantId, query);
		params.from = fromDate;
		params.to = toDate;

		// Coalesce: ưu tiên pg_dsps_sync, tiếp đến dsps_report, cuối cùng là dsp_id gốc
		const resolvedDspName = `coalesce(nullIf(p.dsp_name, ''), nullIf(r.dsp_name, ''), s.dsp_id)`;
		const joinExpr = `
      LEFT JOIN (SELECT * FROM music_analytics.dsps_report FINAL) r ON s.dsp_id = r.id_dsps_report
      LEFT JOIN (SELECT * FROM music_analytics.pg_dsps_sync FINAL) p ON r.pg_uuid = p.pg_uuid
    `;

		let filterSql = baseFilterSql;
		if (query.keyword) {
			filterSql += ` AND ${resolvedDspName} ILIKE {keyword:String}`;
			params.keyword = `%${query.keyword}%`;
		}

		// Count query
		const countSql = queries.getRevenueTopDspCountQuery(
			joinSql,
			joinExpr,
			filterSql,
			resolvedDspName,
		);
		const countResult = await this.clickHouseService.query<{
			total: string;
		}>(countSql, params);
		const totalItems = Number(countResult[0]?.total ?? 0);

		// Data query
		const sql = queries.getRevenueTopDspQuery(
			joinSql,
			joinExpr,
			filterSql,
			resolvedDspName,
			limit,
			offset,
		);
		const rows = await this.clickHouseService.query<{
			pg_dsp_id: string;
			dsp_report_id: string;
			dsp_name: string;
			quantity: string;
			revenue_usd: string;
		}>(sql, params);

		const items: RevenueDspItem[] = rows.map((r) => ({
			pgDspId: r.pg_dsp_id || null,
			dspReportId: r.dsp_report_id,
			dspName: r.dsp_name,
			revenueUsd: this.revenueNumber(r.revenue_usd),
			revenueUsdExact: this.revenueExact(r.revenue_usd),
			quantity: Number(r.quantity),
		}));

		// groupBySource: fetch breakdown per DSP
		if (query.groupBySource && items.length > 0) {
			const breakdowns = await Promise.all(
				items.map((item) =>
					item.dspReportId
						? this.fetchSourceBreakdown(
								CLICKHOUSE_TABLES.SALES_DSP_MONTHLY,
								's.period',
								`${joinSql} ${joinExpr}`,
								filterSql,
								{ ...params },
								'AND s.dsp_id = {_dspId:String}',
								{ _dspId: item.dspReportId },
								true,
							)
						: Promise.resolve([]),
				),
			);
			items.forEach((item, i) => {
				item.bySource = breakdowns[i];
			});
		}

		const shouldIncludeOther = !isPaginated && query.includeOther === true;

		if (shouldIncludeOther && items.length > 0) {
			// Calculate total overall
			const totalSql = queries.getRevenueTopDspTotalQuery(
				joinSql,
				joinExpr,
				filterSql,
			);
			const totalResult = await this.clickHouseService.query<{
				total_qty: string;
				total_rev: string;
			}>(totalSql, params);
			const totalQty = Number(totalResult[0]?.total_qty ?? 0);
			const totalRevExact = this.revenueExact(totalResult[0]?.total_rev);

			const itemsQtySum = items.reduce((acc, it) => acc + it.quantity, 0);
			const itemsRevSumExact = this.addRevenueExact(
				items.map((it) => it.revenueUsdExact),
			);

			const otherQty = totalQty - itemsQtySum;
			const otherRevExact = this.subtractRevenueExact(
				totalRevExact,
				itemsRevSumExact,
			);
			const otherRev = this.revenueNumber(otherRevExact);

			if (otherQty > 0 || otherRev > 0) {
				const otherItem: RevenueDspItem = {
					pgDspId: null,
					dspReportId: '',
					dspName: 'Other',
					revenueUsd: otherRev > 0 ? otherRev : 0,
					revenueUsdExact: otherRev > 0 ? otherRevExact : '0',
					quantity: otherQty > 0 ? otherQty : 0,
				};
				if (query.groupBySource) {
					const topDspIds = items
						.filter((it) => it.dspReportId)
						.map((it) => it.dspReportId);
					otherItem.bySource = await this.fetchSourceBreakdown(
						CLICKHOUSE_TABLES.SALES_DSP_MONTHLY,
						's.period',
						`${joinSql} ${joinExpr}`,
						filterSql,
						{ ...params },
						topDspIds.length > 0
							? 'AND s.dsp_id NOT IN ({_topDspIds:Array(String)})'
							: '',
						topDspIds.length > 0 ? { _topDspIds: topDspIds } : {},
						true,
					);
				}
				items.push(otherItem);
			}
		}

		if (isPaginated) {
			return new PageDto({
				items,
				metadata: { page, pageSize, totalItems },
			});
		} else {
			return new PageDto({
				items,
				metadata: { page: 0, pageSize: 0, totalItems: 0 },
			});
		}
	}

	// ═══════════════════════════════════════════════════════
	// REVENUE TOP ARTIST (Top nghệ sĩ theo doanh thu)
	// Luôn JOIN pg_tracks_sync để lấy artist_ids.
	// System-tenant: không filter tenant_id → thấy tất cả.
	// ═══════════════════════════════════════════════════════
	async getRevenueTopArtist(
		tenantId: string,
		query: TimelineQueryDto,
	): Promise<PageDto<RevenueArtistItem>> {
		const key = this.cache.buildKey('tl:rev-top-artist', tenantId, query);
		return this.cache.wrap(key, () =>
			this.computeRevenueTopArtist(tenantId, query),
		);
	}

	private async computeRevenueTopArtist(
		tenantId: string,
		query: TimelineQueryDto,
	): Promise<PageDto<RevenueArtistItem>> {
		const fromDate = normalizeDateToFirstOfMonth(query.fromDate);
		const toDate = normalizeDateToFirstOfMonth(query.toDate);
		const { limit, offset, page, pageSize, isPaginated } =
			this.getPaginationParams(query);
		const isSystem = checkIsSystemTenant(tenantId);

		const params: Record<string, any> = { from: fromDate, to: toDate };
		let filterSql = 'AND t.is_deleted = 0';

		if (!isSystem) {
			filterSql += ' AND t.tenant_id = {tenantId:String}';
			params.tenantId = tenantId;
		}
		if (query.labelId) {
			filterSql += ' AND t.label_id = {labelId:String}';
			params.labelId = query.labelId;
		}
		if (query.releaseId) {
			filterSql += ' AND t.release_id = {releaseId:String}';
			params.releaseId = query.releaseId;
		}
		if (query.releaseType) {
			filterSql += ' AND t.release_type = {releaseType:String}';
			params.releaseType = query.releaseType;
		}
		if (query.importSource) {
			filterSql += ' AND s.import_source = {importSource:String}';
			params.importSource = query.importSource;
		}

		if (query.keyword) {
			let matchedArtistIds =
				await this.isrcResolverService.getArtistIdsByKeyword(
					query.keyword,
				);
			if (matchedArtistIds.length === 0) {
				matchedArtistIds = ['__none__'];
			}
			params.matchedArtistIds = matchedArtistIds;
		}

		// Count query
		const countSql = queries.getRevenueTopArtistCountQuery(
			filterSql,
			!!query.keyword,
		);
		const countResult = await this.clickHouseService.query<{
			total: string;
		}>(countSql, params);
		const totalItems = Number(countResult[0]?.total ?? 0);

		// Data query
		const sql = queries.getRevenueTopArtistQuery(
			filterSql,
			!!query.keyword,
			limit,
			offset,
		);

		const rows = await this.clickHouseService.query<{
			artistId: string;
			revenue_usd: string;
			quantity: string;
			track_count: string;
		}>(sql, params);

		const items: RevenueArtistItem[] = [];

		if (rows.length > 0) {
			const artistIds = rows.map((r) => r.artistId);
			const artistMetaMap =
				await this.isrcResolverService.getArtistMetadata(artistIds);

			rows.forEach((r, index) => {
				const meta = artistMetaMap.get(r.artistId);
				items.push({
					rank: offset + index + 1,
					artistId: r.artistId,
					artistName: meta?.name ?? 'Unknown Artist',
					picture: meta?.picture ?? null,
					profiles: meta?.profiles ?? [],
					country: meta?.country ?? null,
					genre: meta?.genre ?? null,
					trackCount: Number(r.track_count),
					revenueUsd: this.revenueNumber(r.revenue_usd),
					revenueUsdExact: this.revenueExact(r.revenue_usd),
					quantity: Number(r.quantity),
				});
			});

			// groupBySource: fetch breakdown per artist
			if (query.groupBySource) {
				const joinSql = `INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc`;
				const breakdowns = await Promise.all(
					items
						.filter((item) => item.artistId !== 'other')
						.map((item) =>
							this.fetchSourceBreakdown(
								CLICKHOUSE_TABLES.SALES_DSP_MONTHLY,
								's.period',
								joinSql,
								filterSql,
								{ ...params },
								'AND has(t.artist_ids, {_artistId:String})',
								{ _artistId: item.artistId },
								true,
							),
						),
				);
				items
					.filter((it) => it.artistId !== 'other')
					.forEach((item, i) => {
						item.bySource = breakdowns[i];
					});
			}

			const shouldIncludeOther =
				!isPaginated && query.includeOther === true;

			if (shouldIncludeOther) {
				// Calculate total overall from joined tracks table
				const totalSql = queries.getRevenueTopArtistTotalQuery(
					filterSql,
					!!query.keyword,
				);
				const totalResult = await this.clickHouseService.query<{
					total_qty: string;
					total_rev: string;
				}>(totalSql, params);
				const totalQty = Number(totalResult[0]?.total_qty ?? 0);
				const totalRevExact = this.revenueExact(
					totalResult[0]?.total_rev,
				);

				const itemsQtySum = items.reduce(
					(acc, it) => acc + it.quantity,
					0,
				);
				const itemsRevSumExact = this.addRevenueExact(
					items.map((it) => it.revenueUsdExact),
				);

				const otherQty = totalQty - itemsQtySum;
				const otherRevExact = this.subtractRevenueExact(
					totalRevExact,
					itemsRevSumExact,
				);
				const otherRev = this.revenueNumber(otherRevExact);

				if (otherQty > 0 || otherRev > 0) {
					const otherItem: RevenueArtistItem = {
						rank: items.length + 1,
						artistId: 'other',
						artistName: 'Other',
						picture: null,
						profiles: [],
						country: null,
						genre: null,
						trackCount: 0,
						revenueUsd: otherRev > 0 ? otherRev : 0,
						revenueUsdExact: otherRev > 0 ? otherRevExact : '0',
						quantity: otherQty > 0 ? otherQty : 0,
					};
					if (query.groupBySource) {
						const joinSql = `INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc`;
						const topArtistIds = items
							.filter((it) => it.artistId !== 'other')
							.map((it) => it.artistId);
						otherItem.bySource = await this.fetchSourceBreakdown(
							CLICKHOUSE_TABLES.SALES_DSP_MONTHLY,
							's.period',
							joinSql,
							filterSql,
							{ ...params },
							topArtistIds.length > 0
								? 'AND NOT hasAny(t.artist_ids, {_topArtistIds:Array(String)})'
								: '',
							topArtistIds.length > 0
								? { _topArtistIds: topArtistIds }
								: {},
							true,
						);
					}
					items.push(otherItem);
				}
			}
		}

		if (isPaginated) {
			return new PageDto({
				items,
				metadata: { page, pageSize, totalItems },
			});
		} else {
			return new PageDto({
				items,
				metadata: { page: 0, pageSize: 0, totalItems: 0 },
			});
		}
	}

	// ═══════════════════════════════════════════════════════
	// REVENUE TOP TRACK (Top track theo doanh thu)
	// Normal tenant: JOIN pg_tracks_sync, enrich từ Postgres.
	// System-tenant: query tất cả ISRC trong ClickHouse,
	//   enrich Postgres trước, ISRC thiếu fallback fact_sales_report.
	// ═══════════════════════════════════════════════════════
	async getRevenueTopTrack(
		tenantId: string,
		query: TimelineQueryDto,
	): Promise<PageDto<RevenueTrackItem>> {
		const key = this.cache.buildKey('tl:rev-top-track', tenantId, query);
		return this.cache.wrap(key, () =>
			this.computeRevenueTopTrack(tenantId, query),
		);
	}

	private async computeRevenueTopTrack(
		tenantId: string,
		query: TimelineQueryDto,
	): Promise<PageDto<RevenueTrackItem>> {
		const fromDate = normalizeDateToFirstOfMonth(query.fromDate);
		const toDate = normalizeDateToFirstOfMonth(query.toDate);
		const { limit, offset, page, pageSize, isPaginated } =
			this.getPaginationParams(query);
		const isSystem = checkIsSystemTenant(tenantId);

		const params: Record<string, any> = { from: fromDate, to: toDate };

		let joinSql = '';
		let filterSql = '';

		if (!isSystem) {
			joinSql = `INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc`;
			filterSql =
				'AND t.is_deleted = 0 AND t.tenant_id = {tenantId:String}';
			params.tenantId = tenantId;

			if (query.labelId) {
				filterSql += ' AND t.label_id = {labelId:String}';
				params.labelId = query.labelId;
			}
			if (query.releaseId) {
				filterSql += ' AND t.release_id = {releaseId:String}';
				params.releaseId = query.releaseId;
			}
			if (query.releaseType) {
				filterSql += ' AND t.release_type = {releaseType:String}';
				params.releaseType = query.releaseType;
			}
			if (query.importSource) {
				filterSql += ' AND s.import_source = {importSource:String}';
				params.importSource = query.importSource;
			}
		} else {
			if (
				query.labelId ||
				query.releaseId ||
				query.releaseType ||
				query.importSource
			) {
				joinSql = `INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc`;
				filterSql = 'AND t.is_deleted = 0';
				if (query.labelId) {
					filterSql += ' AND t.label_id = {labelId:String}';
					params.labelId = query.labelId;
				}
				if (query.releaseId) {
					filterSql += ' AND t.release_id = {releaseId:String}';
					params.releaseId = query.releaseId;
				}
				if (query.releaseType) {
					filterSql += ' AND t.release_type = {releaseType:String}';
					params.releaseType = query.releaseType;
				}
				if (query.importSource) {
					filterSql += ' AND s.import_source = {importSource:String}';
					params.importSource = query.importSource;
				}
			}
		}

		if (query.keyword) {
			let matchedIsrcs =
				await this.isrcResolverService.getIsrcsByTrackTitleKeyword(
					query.keyword,
				);
			if (matchedIsrcs.length === 0) {
				matchedIsrcs = ['__none__'];
			}
			filterSql += ' AND s.isrc IN ({matchedIsrcs:Array(String)})';
			params.matchedIsrcs = matchedIsrcs;
		}

		if (!joinSql) {
			joinSql = `INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc`;
			filterSql += ' AND t.is_deleted = 0';
		}
		filterSql += ` ${this.validReleaseUpcFilter}`;

		// Count query
		const countSql = queries.getRevenueTopTrackCountQuery(
			joinSql,
			filterSql,
		);
		const countResult = await this.clickHouseService.query<{
			total: string;
		}>(countSql, params);
		const totalItems = Number(countResult[0]?.total ?? 0);

		// Data query
		const sql = queries.getRevenueTopTrackQuery(
			joinSql,
			filterSql,
			limit,
			offset,
		);

		const rows = await this.clickHouseService.query<{
			isrc: string;
			revenue_usd: string;
			quantity: string;
			trackTitle: string;
			trackVersion: string;
			releaseId: string;
			releaseTitle: string;
			labelId: string;
			labelName: string;
			artistNames: string[];
			trackMetadataSpotify: string;
			trackMetadataDeezer: string;
			releaseMetadataSpotify: string;
			releaseMetadataDeezer: string;
		}>(sql, params);

		const items: RevenueTrackItem[] = [];

		if (rows.length > 0) {
			const missingIsrcs = isSystem
				? rows.filter((row) => !row.trackTitle).map((row) => row.isrc)
				: [];

			const fallbackMap = new Map<
				string,
				{ trackTitle: string; artistName: string }
			>();
			if (missingIsrcs.length > 0) {
				const fbParams = { isrcs: missingIsrcs };
				const fbSql = queries.getRevenueTopTrackFallbackQuery();
				const fbRows = await this.clickHouseService.query<{
					isrc: string;
					track_title: string;
					artist_name: string;
				}>(fbSql, fbParams);
				for (const fb of fbRows) {
					fallbackMap.set(fb.isrc, {
						trackTitle: fb.track_title,
						artistName: fb.artist_name,
					});
				}
			}

			rows.forEach((r, index) => {
				const fallback = fallbackMap.get(r.isrc);
				const artistNames = Array.isArray(r.artistNames) ? r.artistNames : [];
				items.push({
					rank: offset + index + 1,
					isrc: r.isrc,
					title: r.trackTitle || fallback?.trackTitle || '',
					version: r.trackVersion || null,
					artistName: artistNames.join(', ') || fallback?.artistName || '',
					releaseId: r.releaseId || null,
					releaseTitle: r.releaseTitle || null,
					labelId: r.labelId || null,
					labelName: r.labelName || null,
					revenueUsd: this.revenueNumber(r.revenue_usd),
					revenueUsdExact: this.revenueExact(r.revenue_usd),
					quantity: Number(r.quantity),
					metadataExternal: normalizeSyncedMetadataExternal(
						r.trackMetadataSpotify,
						r.trackMetadataDeezer,
					),
					release: r.releaseId
						? {
								metadataExternal: normalizeSyncedMetadataExternal(
									r.releaseMetadataSpotify,
									r.releaseMetadataDeezer,
								),
							}
						: null,
				});
			});

			// groupBySource: fetch breakdown per track
			if (query.groupBySource) {
				const breakdowns = await Promise.all(
					items
						.filter((item) => item.isrc !== 'other')
						.map((item) =>
							this.fetchSourceBreakdown(
								CLICKHOUSE_TABLES.SALES_DSP_MONTHLY,
								's.period',
								joinSql,
								filterSql,
								{ ...params },
								'AND s.isrc = {_isrc:String}',
								{ _isrc: item.isrc },
								true,
							),
						),
				);
				items
					.filter((it) => it.isrc !== 'other')
					.forEach((item, i) => {
						item.bySource = breakdowns[i];
					});
			}

			const shouldIncludeOther =
				!isPaginated && query.includeOther === true;

			if (shouldIncludeOther) {
				const totalSql = queries.getRevenueTopTrackTotalQuery(
					joinSql,
					filterSql,
				);
				const totalResult = await this.clickHouseService.query<{
					total_qty: string;
					total_rev: string;
				}>(totalSql, params);
				const totalQty = Number(totalResult[0]?.total_qty ?? 0);
				const totalRevExact = this.revenueExact(
					totalResult[0]?.total_rev,
				);

				const itemsQtySum = items.reduce(
					(acc, it) => acc + it.quantity,
					0,
				);
				const itemsRevSumExact = this.addRevenueExact(
					items.map((it) => it.revenueUsdExact),
				);

				const otherQty = totalQty - itemsQtySum;
				const otherRevExact = this.subtractRevenueExact(
					totalRevExact,
					itemsRevSumExact,
				);
				const otherRev = this.revenueNumber(otherRevExact);

				if (otherQty > 0 || otherRev > 0) {
					const otherItem: RevenueTrackItem = {
						rank: items.length + 1,
						isrc: 'other',
						title: 'Other',
						version: null,
						artistName: '',
						releaseId: null,
						releaseTitle: null,
						labelId: null,
						labelName: null,
						revenueUsd: otherRev > 0 ? otherRev : 0,
						revenueUsdExact: otherRev > 0 ? otherRevExact : '0',
						quantity: otherQty > 0 ? otherQty : 0,
						metadataExternal: {},
						release: null,
					};
					if (query.groupBySource) {
						const topIsrcs = items
							.filter((it) => it.isrc !== 'other')
							.map((it) => it.isrc);
						otherItem.bySource = await this.fetchSourceBreakdown(
							CLICKHOUSE_TABLES.SALES_DSP_MONTHLY,
							's.period',
							joinSql,
							filterSql,
							{ ...params },
							topIsrcs.length > 0
								? 'AND s.isrc NOT IN ({_topIsrcs:Array(String)})'
								: '',
							topIsrcs.length > 0 ? { _topIsrcs: topIsrcs } : {},
							true,
						);
					}
					items.push(otherItem);
				}
			}
		}

		if (isPaginated) {
			return new PageDto({
				items,
				metadata: { page, pageSize, totalItems },
			});
		} else {
			return new PageDto({
				items,
				metadata: { page: 0, pageSize: 0, totalItems: 0 },
			});
		}
	}

	// ═══════════════════════════════════════════════════════
	// REVENUE TOP LABEL (Top label theo doanh thu)
	// ═══════════════════════════════════════════════════════
	async getRevenueTopLabel(
		tenantId: string,
		query: TimelineQueryDto,
	): Promise<PageDto<RevenueLabelItem>> {
		const key = this.cache.buildKey('tl:rev-top-label', tenantId, query);
		return this.cache.wrap(key, () =>
			this.computeRevenueTopLabel(tenantId, query),
		);
	}

	private async computeRevenueTopLabel(
		tenantId: string,
		query: TimelineQueryDto,
	): Promise<PageDto<RevenueLabelItem>> {
		const fromDate = normalizeDateToFirstOfMonth(query.fromDate);
		const toDate = normalizeDateToFirstOfMonth(query.toDate);
		const { limit, offset, page, pageSize, isPaginated } =
			this.getPaginationParams(query);
		const isSystem = checkIsSystemTenant(tenantId);

		const params: Record<string, any> = { from: fromDate, to: toDate };
		let filterSql = 'AND t.is_deleted = 0';

		if (!isSystem) {
			filterSql += ' AND t.tenant_id = {tenantId:String}';
			params.tenantId = tenantId;
		}
		if (query.labelId) {
			filterSql += ' AND t.label_id = {labelId:String}';
			params.labelId = query.labelId;
		}
		if (query.releaseId) {
			filterSql += ' AND t.release_id = {releaseId:String}';
			params.releaseId = query.releaseId;
		}
		if (query.releaseType) {
			filterSql += ' AND t.release_type = {releaseType:String}';
			params.releaseType = query.releaseType;
		}
		if (query.importSource) {
			filterSql += ' AND s.import_source = {importSource:String}';
			params.importSource = query.importSource;
		}

		if (query.keyword) {
			let matchedLabelIds =
				await this.isrcResolverService.getLabelIdsByKeyword(
					query.keyword,
				);
			if (matchedLabelIds.length === 0) {
				matchedLabelIds = ['__none__'];
			}
			filterSql += ' AND t.label_id IN ({matchedLabelIds:Array(String)})';
			params.matchedLabelIds = matchedLabelIds;
		}

		const joinSql = `INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc`;

		// Count query
		const countSql = queries.getRevenueTopLabelCountQuery(
			joinSql,
			filterSql,
		);
		const countResult = await this.clickHouseService.query<{
			total: string;
		}>(countSql, params);
		const totalItems = Number(countResult[0]?.total ?? 0);

		// Data query
		const sql = queries.getRevenueTopLabelQuery(
			joinSql,
			filterSql,
			limit,
			offset,
		);
		const rows = await this.clickHouseService.query<{
			labelId: string;
			revenue_usd: string;
			quantity: string;
			release_count: string;
			track_count: string;
		}>(sql, params);

		const items: RevenueLabelItem[] = [];

		if (rows.length > 0) {
			const labelIds = rows.map((r) => r.labelId);
			const labelsMeta =
				await this.isrcResolverService.getLabelMetadata(labelIds);

			rows.forEach((r, index) => {
				const meta = labelsMeta.get(r.labelId);
				items.push({
					rank: offset + index + 1,
					labelId: r.labelId,
					labelName: meta?.name ?? 'Unknown Label',
					picture: meta?.picture ?? null,
					releaseCount: Number(r.release_count),
					trackCount: Number(r.track_count),
					revenueUsd: this.revenueNumber(r.revenue_usd),
					revenueUsdExact: this.revenueExact(r.revenue_usd),
					quantity: Number(r.quantity),
					tenant: meta?.tenant ?? null,
				});
			});

			// groupBySource: fetch breakdown per label
			if (query.groupBySource) {
				const breakdowns = await Promise.all(
					items
						.filter((item) => item.labelId !== 'other')
						.map((item) =>
							this.fetchSourceBreakdown(
								CLICKHOUSE_TABLES.SALES_DSP_MONTHLY,
								's.period',
								joinSql,
								filterSql,
								{ ...params },
								'AND t.label_id = {_labelId:String}',
								{ _labelId: item.labelId },
								true,
							),
						),
				);
				items
					.filter((it) => it.labelId !== 'other')
					.forEach((item, i) => {
						item.bySource = breakdowns[i];
					});
			}

			const shouldIncludeOther =
				!isPaginated && query.includeOther === true;

			if (shouldIncludeOther) {
				const totalSql = queries.getRevenueTopLabelTotalQuery(
					joinSql,
					filterSql,
				);
				const totalResult = await this.clickHouseService.query<{
					total_qty: string;
					total_rev: string;
				}>(totalSql, params);
				const totalQty = Number(totalResult[0]?.total_qty ?? 0);
				const totalRevExact = this.revenueExact(
					totalResult[0]?.total_rev,
				);

				const itemsQtySum = items.reduce(
					(acc, it) => acc + it.quantity,
					0,
				);
				const itemsRevSumExact = this.addRevenueExact(
					items.map((it) => it.revenueUsdExact),
				);

				const otherQty = totalQty - itemsQtySum;
				const otherRevExact = this.subtractRevenueExact(
					totalRevExact,
					itemsRevSumExact,
				);
				const otherRev = this.revenueNumber(otherRevExact);

				if (otherQty > 0 || otherRev > 0) {
					const otherItem: RevenueLabelItem = {
						rank: items.length + 1,
						labelId: 'other',
						labelName: 'Other',
						picture: null,
						revenueUsd: otherRev > 0 ? otherRev : 0,
						revenueUsdExact: otherRev > 0 ? otherRevExact : '0',
						quantity: otherQty > 0 ? otherQty : 0,
						tenant: null,
					};
					if (query.groupBySource) {
						const topLabelIds = items
							.filter((it) => it.labelId !== 'other')
							.map((it) => it.labelId);
						otherItem.bySource = await this.fetchSourceBreakdown(
							CLICKHOUSE_TABLES.SALES_DSP_MONTHLY,
							's.period',
							joinSql,
							filterSql,
							{ ...params },
							topLabelIds.length > 0
								? 'AND t.label_id NOT IN ({_topLabelIds:Array(String)})'
								: '',
							topLabelIds.length > 0
								? { _topLabelIds: topLabelIds }
								: {},
							true,
						);
					}
					items.push(otherItem);
				}
			}
		}

		if (isPaginated) {
			return new PageDto({
				items,
				metadata: { page, pageSize, totalItems },
			});
		} else {
			return new PageDto({
				items,
				metadata: { page: 0, pageSize: 0, totalItems: 0 },
			});
		}
	}

	// ═══════════════════════════════════════════════════════
	// REVENUE TOP CHANNEL (Top channel theo doanh thu - video only)
	// ═══════════════════════════════════════════════════════
	async getRevenueTopChannel(
		tenantId: string,
		query: TimelineQueryDto,
	): Promise<PageDto<RevenueChannelItem>> {
		const key = this.cache.buildKey('tl:rev-top-channel', tenantId, query);
		return this.cache.wrap(key, () =>
			this.computeRevenueTopChannel(tenantId, query),
		);
	}

	private async computeRevenueTopChannel(
		tenantId: string,
		query: TimelineQueryDto,
	): Promise<PageDto<RevenueChannelItem>> {
		const fromDate = normalizeDateToFirstOfMonth(query.fromDate);
		const toDate = normalizeDateToFirstOfMonth(query.toDate);
		const { limit, offset, page, pageSize, isPaginated } =
			this.getPaginationParams(query);
		const isSystem = checkIsSystemTenant(tenantId);

		const params: Record<string, any> = { from: fromDate, to: toDate };
		let filterSql = 'AND t.is_deleted = 0';

		if (!isSystem) {
			filterSql += ' AND t.tenant_id = {tenantId:String}';
			params.tenantId = tenantId;
		}
		if (query.labelId) {
			filterSql += ' AND t.label_id = {labelId:String}';
			params.labelId = query.labelId;
		}
		if (query.releaseId) {
			filterSql += ' AND t.release_id = {releaseId:String}';
			params.releaseId = query.releaseId;
		}
		// releaseType khong can - channel_id chi co o video
		if (query.importSource) {
			filterSql += ' AND s.import_source = {importSource:String}';
			params.importSource = query.importSource;
		}

		const joinSql = `INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc`;

		// Count query
		const countSql = queries.getRevenueTopChannelCountQuery(
			joinSql,
			filterSql,
		);
		const countResult = await this.clickHouseService.query<{
			total: string;
		}>(countSql, params);
		const totalItems = Number(countResult[0]?.total ?? 0);

		// Data query
		const sql = queries.getRevenueTopChannelQuery(
			joinSql,
			filterSql,
			limit,
			offset,
		);
		const rows = await this.clickHouseService.query<{
			channelId: string;
			revenue_usd: string;
			quantity: string;
			release_count: string;
			track_count: string;
		}>(sql, params);

		const items: RevenueChannelItem[] = [];

		if (rows.length > 0) {
			const channelIds = rows.map((r) => r.channelId);
			const channelsMeta =
				await this.isrcResolverService.getChannelMetadata(channelIds);

			rows.forEach((r, index) => {
				const meta = channelsMeta.get(r.channelId);
				items.push({
					rank: offset + index + 1,
					channelId: r.channelId,
					channelName: meta?.name ?? 'Unknown Channel',
					thumbUrl: meta?.thumbUrl ?? null,
					youtubeChannelId: meta?.youtubeChannelId ?? null,
					releaseCount: Number(r.release_count),
					trackCount: Number(r.track_count),
					revenueUsd: this.revenueNumber(r.revenue_usd),
					revenueUsdExact: this.revenueExact(r.revenue_usd),
					quantity: Number(r.quantity),
					tenant: meta?.tenant ?? null,
				});
			});

			// groupBySource: fetch breakdown per channel
			if (query.groupBySource) {
				const breakdowns = await Promise.all(
					items
						.filter((item) => item.channelId !== 'other')
						.map((item) =>
							this.fetchSourceBreakdown(
								CLICKHOUSE_TABLES.SALES_DSP_MONTHLY,
								's.period',
								joinSql,
								filterSql,
								{ ...params },
								'AND t.channel_id = {_channelId:String}',
								{ _channelId: item.channelId },
								true,
							),
						),
				);
				items
					.filter((it) => it.channelId !== 'other')
					.forEach((item, i) => {
						item.bySource = breakdowns[i];
					});
			}

			const shouldIncludeOther =
				!isPaginated && query.includeOther === true;

			if (shouldIncludeOther) {
				const totalSql = queries.getRevenueTopChannelTotalQuery(
					joinSql,
					filterSql,
				);
				const totalResult = await this.clickHouseService.query<{
					total_qty: string;
					total_rev: string;
				}>(totalSql, params);
				const totalQty = Number(totalResult[0]?.total_qty ?? 0);
				const totalRevExact = this.revenueExact(
					totalResult[0]?.total_rev,
				);

				const itemsQtySum = items.reduce(
					(acc, it) => acc + it.quantity,
					0,
				);
				const itemsRevSumExact = this.addRevenueExact(
					items.map((it) => it.revenueUsdExact),
				);

				const otherQty = totalQty - itemsQtySum;
				const otherRevExact = this.subtractRevenueExact(
					totalRevExact,
					itemsRevSumExact,
				);
				const otherRev = this.revenueNumber(otherRevExact);

				if (otherQty > 0 || otherRev > 0) {
					const otherItem: RevenueChannelItem = {
						rank: items.length + 1,
						channelId: 'other',
						channelName: 'Other',
						thumbUrl: null,
						youtubeChannelId: null,
						revenueUsd: otherRev > 0 ? otherRev : 0,
						revenueUsdExact: otherRev > 0 ? otherRevExact : '0',
						quantity: otherQty > 0 ? otherQty : 0,
						tenant: null,
					};
					if (query.groupBySource) {
						const topChannelIds = items
							.filter((it) => it.channelId !== 'other')
							.map((it) => it.channelId);
						otherItem.bySource = await this.fetchSourceBreakdown(
							CLICKHOUSE_TABLES.SALES_DSP_MONTHLY,
							's.period',
							joinSql,
							filterSql,
							{ ...params },
							topChannelIds.length > 0
								? 'AND t.channel_id NOT IN ({_topChannelIds:Array(String)})'
								: '',
							topChannelIds.length > 0
								? { _topChannelIds: topChannelIds }
								: {},
							true,
						);
					}
					items.push(otherItem);
				}
			}
		}

		if (isPaginated) {
			return new PageDto({
				items,
				metadata: { page, pageSize, totalItems },
			});
		} else {
			return new PageDto({
				items,
				metadata: { page: 0, pageSize: 0, totalItems: 0 },
			});
		}
	}

	// ═══════════════════════════════════════════════════════
	// REVENUE TOP TENANT (Top tenant theo doanh thu)
	// ═══════════════════════════════════════════════════════
	async getRevenueTopTenant(
		tenantId: string,
		query: TimelineQueryDto,
	): Promise<PageDto<RevenueTenantItem>> {
		const key = this.cache.buildKey('tl:rev-top-tenant', tenantId, query);
		return this.cache.wrap(key, () =>
			this.computeRevenueTopTenant(tenantId, query),
		);
	}

	private async computeRevenueTopTenant(
		tenantId: string,
		query: TimelineQueryDto,
	): Promise<PageDto<RevenueTenantItem>> {
		const fromDate = normalizeDateToFirstOfMonth(query.fromDate);
		const toDate = normalizeDateToFirstOfMonth(query.toDate);
		const { limit, offset, page, pageSize, isPaginated } =
			this.getPaginationParams(query);
		const isSystem = checkIsSystemTenant(tenantId);

		const params: Record<string, any> = { from: fromDate, to: toDate };
		let filterSql = 'AND t.is_deleted = 0';

		if (!isSystem) {
			filterSql += ' AND t.tenant_id = {tenantId:String}';
			params.tenantId = tenantId;
		}

		if (query.releaseType) {
			filterSql += ' AND t.release_type = {releaseType:String}';
			params.releaseType = query.releaseType;
		}
		if (query.importSource) {
			filterSql += ' AND s.import_source = {importSource:String}';
			params.importSource = query.importSource;
		}

		if (query.keyword) {
			let matchedTenantIds =
				await this.isrcResolverService.getTenantIdsByKeyword(
					query.keyword,
				);
			if (matchedTenantIds.length === 0) {
				matchedTenantIds = ['__none__'];
			}
			filterSql +=
				' AND t.tenant_id IN ({matchedTenantIds:Array(String)})';
			params.matchedTenantIds = matchedTenantIds;
		}

		const joinSql = `INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc`;

		// Count query
		const countSql = queries.getRevenueTopTenantCountQuery(
			joinSql,
			filterSql,
		);
		const countResult = await this.clickHouseService.query<{
			total: string;
		}>(countSql, params);
		const totalItems = Number(countResult[0]?.total ?? 0);

		// Data query
		const sql = queries.getRevenueTopTenantQuery(
			joinSql,
			filterSql,
			limit,
			offset,
		);
		const rows = await this.clickHouseService.query<{
			tenantId: string;
			revenue_usd: string;
			quantity: string;
		}>(sql, params);

		const items: RevenueTenantItem[] = [];

		if (rows.length > 0) {
			const tenantIds = rows.map((r) => r.tenantId);
			const tenantMetaMap =
				await this.isrcResolverService.getTenantMetadata(tenantIds);

			rows.forEach((r, index) => {
				const meta = tenantMetaMap.get(r.tenantId);
				items.push({
					rank: offset + index + 1,
					tenantId: r.tenantId,
					tenantName: meta?.title ?? 'Unknown Tenant',
					logo: meta?.logo ?? null,
					revenueUsd: this.revenueNumber(r.revenue_usd),
					revenueUsdExact: this.revenueExact(r.revenue_usd),
					quantity: Number(r.quantity),
				});
			});

			// groupBySource: fetch breakdown per tenant
			if (query.groupBySource) {
				const breakdowns = await Promise.all(
					items
						.filter((item) => item.tenantId !== 'other')
						.map((item) =>
							this.fetchSourceBreakdown(
								CLICKHOUSE_TABLES.SALES_DSP_MONTHLY,
								's.period',
								joinSql,
								filterSql,
								{ ...params },
								'AND t.tenant_id = {_tenantId:String}',
								{ _tenantId: item.tenantId },
								true,
							),
						),
				);
				items
					.filter((it) => it.tenantId !== 'other')
					.forEach((item, i) => {
						item.bySource = breakdowns[i];
					});
			}

			const shouldIncludeOther =
				!isPaginated && query.includeOther === true;

			if (shouldIncludeOther) {
				const totalSql = queries.getRevenueTopTenantTotalQuery(
					joinSql,
					filterSql,
				);
				const totalResult = await this.clickHouseService.query<{
					total_qty: string;
					total_rev: string;
				}>(totalSql, params);
				const totalQty = Number(totalResult[0]?.total_qty ?? 0);
				const totalRevExact = this.revenueExact(
					totalResult[0]?.total_rev,
				);

				const itemsQtySum = items.reduce(
					(acc, it) => acc + it.quantity,
					0,
				);
				const itemsRevSumExact = this.addRevenueExact(
					items.map((it) => it.revenueUsdExact),
				);

				const otherQty = totalQty - itemsQtySum;
				const otherRevExact = this.subtractRevenueExact(
					totalRevExact,
					itemsRevSumExact,
				);
				const otherRev = this.revenueNumber(otherRevExact);

				if (otherQty > 0 || otherRev > 0) {
					const otherItem: RevenueTenantItem = {
						rank: items.length + 1,
						tenantId: 'other',
						tenantName: 'Other',
						logo: null,
						revenueUsd: otherRev > 0 ? otherRev : 0,
						revenueUsdExact: otherRev > 0 ? otherRevExact : '0',
						quantity: otherQty > 0 ? otherQty : 0,
					};
					if (query.groupBySource) {
						const topTenantIds = items
							.filter((it) => it.tenantId !== 'other')
							.map((it) => it.tenantId);
						otherItem.bySource = await this.fetchSourceBreakdown(
							CLICKHOUSE_TABLES.SALES_DSP_MONTHLY,
							's.period',
							joinSql,
							filterSql,
							{ ...params },
							topTenantIds.length > 0
								? 'AND t.tenant_id NOT IN ({_topTenantIds:Array(String)})'
								: '',
							topTenantIds.length > 0
								? { _topTenantIds: topTenantIds }
								: {},
							true,
						);
					}
					items.push(otherItem);
				}
			}
		}

		if (isPaginated) {
			return new PageDto({
				items,
				metadata: { page, pageSize, totalItems },
			});
		} else {
			return new PageDto({
				items,
				metadata: { page: 0, pageSize: 0, totalItems: 0 },
			});
		}
	}

	// ═══════════════════════════════════════════════════════
	// REVENUE TOP SOURCE TYPE (Top import source theo doanh thu)
	// ═══════════════════════════════════════════════════════
	async getRevenueTopSourceType(
		tenantId: string,
		query: TimelineQueryDto,
	): Promise<PageDto<RevenueSourceTypeItem>> {
		const key = this.cache.buildKey(
			'tl:rev-top-source-type',
			tenantId,
			query,
		);
		return this.cache.wrap(key, () =>
			this.computeRevenueTopSourceType(tenantId, query),
		);
	}

	private async computeRevenueTopSourceType(
		tenantId: string,
		query: TimelineQueryDto,
	): Promise<PageDto<RevenueSourceTypeItem>> {
		const fromDate = normalizeDateToFirstOfMonth(query.fromDate);
		const toDate = normalizeDateToFirstOfMonth(query.toDate);
		const { limit, offset, page, pageSize, isPaginated } =
			this.getPaginationParams(query);
		const isSystem = checkIsSystemTenant(tenantId);

		const params: Record<string, any> = { from: fromDate, to: toDate };
		let filterSql = 'AND t.is_deleted = 0';

		if (!isSystem) {
			filterSql += ' AND t.tenant_id = {tenantId:String}';
			params.tenantId = tenantId;
		}

		if (query.releaseType) {
			filterSql += ' AND t.release_type = {releaseType:String}';
			params.releaseType = query.releaseType;
		}

		if (query.keyword) {
			let matchedTenantIds =
				await this.isrcResolverService.getTenantIdsByKeyword(
					query.keyword,
				);
			if (matchedTenantIds.length === 0) {
				matchedTenantIds = ['__none__'];
			}
			filterSql +=
				' AND t.tenant_id IN ({matchedTenantIds:Array(String)})';
			params.matchedTenantIds = matchedTenantIds;
		}

		const joinSql = `INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc`;

		// Count query
		const countSql = queries.getRevenueTopSourceTypeCountQuery(
			joinSql,
			filterSql,
		);
		const countResult = await this.clickHouseService.query<{
			total: string;
		}>(countSql, params);
		const totalItems = Number(countResult[0]?.total ?? 0);

		// Data query
		const sql = queries.getRevenueTopSourceTypeQuery(
			joinSql,
			filterSql,
			limit,
			offset,
		);
		const rows = await this.clickHouseService.query<{
			sourceType: string;
			revenue_usd: string;
			quantity: string;
		}>(sql, params);

		const items: RevenueSourceTypeItem[] = [];

		if (rows.length > 0) {
			rows.forEach((r, index) => {
				items.push({
					rank: offset + index + 1,
					sourceType: r.sourceType,
					sourceTypeLabel: getImportSourceLabel(r.sourceType),
					revenueUsd: this.revenueNumber(r.revenue_usd),
					revenueUsdExact: this.revenueExact(r.revenue_usd),
					quantity: Number(r.quantity),
				});
			});

			const shouldIncludeOther =
				!isPaginated && query.includeOther === true;

			if (shouldIncludeOther) {
				const totalSql = queries.getRevenueTopSourceTypeTotalQuery(
					joinSql,
					filterSql,
				);
				const totalResult = await this.clickHouseService.query<{
					total_qty: string;
					total_rev: string;
				}>(totalSql, params);
				const totalQty = Number(totalResult[0]?.total_qty ?? 0);
				const totalRevExact = this.revenueExact(
					totalResult[0]?.total_rev,
				);

				const itemsQtySum = items.reduce(
					(acc, it) => acc + it.quantity,
					0,
				);
				const itemsRevSumExact = this.addRevenueExact(
					items.map((it) => it.revenueUsdExact),
				);

				const otherQty = totalQty - itemsQtySum;
				const otherRevExact = this.subtractRevenueExact(
					totalRevExact,
					itemsRevSumExact,
				);
				const otherRev = this.revenueNumber(otherRevExact);

				if (otherQty > 0 || otherRev > 0) {
					items.push({
						rank: items.length + 1,
						sourceType: 'other',
						sourceTypeLabel: 'Other',
						revenueUsd: otherRev > 0 ? otherRev : 0,
						revenueUsdExact: otherRev > 0 ? otherRevExact : '0',
						quantity: otherQty > 0 ? otherQty : 0,
					});
				}
			}
		}

		if (isPaginated) {
			return new PageDto({
				items,
				metadata: { page, pageSize, totalItems },
			});
		} else {
			return new PageDto({
				items,
				metadata: { page: 0, pageSize: 0, totalItems: 0 },
			});
		}
	}

	// ═══════════════════════════════════════════════════════
	// TRENDS OVERVIEW (Tổng quan xu hướng trends)
	// ═══════════════════════════════════════════════════════
	async getTrendsOverview(
		tenantId: string,
		query: TimelineQueryDto,
	): Promise<OverviewTrendsResponse> {
		const key = this.cache.buildKey('tl:trends-overview', tenantId, query);
		return this.cache.wrap(key, () =>
			this.computeTrendsOverview(tenantId, query),
		);
	}

	private async computeTrendsOverview(
		tenantId: string,
		query: TimelineQueryDto,
	): Promise<OverviewTrendsResponse> {
		const isSystem = checkIsSystemTenant(tenantId);
		const params: Record<string, any> = {
			from: query.fromDate,
			to: query.toDate,
		};

		const joinSql = `INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc`;
		let filterSql = 'AND t.is_deleted = 0';

		if (!isSystem) {
			filterSql += ' AND t.tenant_id = {tenantId:String}';
			params.tenantId = tenantId;
		}
		if (query.labelId) {
			filterSql += ' AND t.label_id = {labelId:String}';
			params.labelId = query.labelId;
		}
		if (query.releaseId) {
			filterSql += ' AND t.release_id = {releaseId:String}';
			params.releaseId = query.releaseId;
		}
		if (query.releaseType) {
			filterSql += ' AND t.release_type = {releaseType:String}';
			params.releaseType = query.releaseType;
		}

		// Query 1: views, dsps, tracks, labels
		const mainSql = queries.getTrendsOverviewMainQuery(joinSql, filterSql);

		const mainResult = await this.clickHouseService.query<{
			total_views: string;
			total_dsps: string;
			total_tracks: string;
			total_labels: string;
		}>(mainSql, params);

		// Query 2: artist count using subquery to handle arrayJoin safely
		const artistSql = queries.getTrendsOverviewArtistQuery(
			joinSql,
			filterSql,
		);
		const artistResult = await this.clickHouseService.query<{
			total_artists: string;
		}>(artistSql, params);

		return {
			totalViews: Number(mainResult[0]?.total_views ?? 0),
			totalDsps: Number(mainResult[0]?.total_dsps ?? 0),
			totalTracks: Number(mainResult[0]?.total_tracks ?? 0),
			totalArtists: Number(artistResult[0]?.total_artists ?? 0),
			totalLabels: Number(mainResult[0]?.total_labels ?? 0),
		};
	}

	// ═══════════════════════════════════════════════════════
	// REVENUE TOP RELEASE (Top releases by revenue)
	// ═══════════════════════════════════════════════════════
	async getRevenueTopRelease(
		tenantId: string,
		query: TimelineQueryDto,
	): Promise<PageDto<RevenueReleaseItem>> {
		const key = this.cache.buildKey('tl:rev-top-release', tenantId, query);
		return this.cache.wrap(key, () =>
			this.computeRevenueTopRelease(tenantId, query),
		);
	}

	private async computeRevenueTopRelease(
		tenantId: string,
		query: TimelineQueryDto,
	): Promise<PageDto<RevenueReleaseItem>> {
		const fromDate = normalizeDateToFirstOfMonth(query.fromDate);
		const toDate = normalizeDateToFirstOfMonth(query.toDate);
		const { limit, offset, page, pageSize, isPaginated } =
			this.getPaginationParams(query);
		const isSystem = checkIsSystemTenant(tenantId);

		const params: Record<string, any> = { from: fromDate, to: toDate };
		let filterSql = `AND t.is_deleted = 0 ${this.validReleaseUpcFilter}`;

		if (!isSystem) {
			filterSql += ' AND t.tenant_id = {tenantId:String}';
			params.tenantId = tenantId;
		}
		if (query.labelId) {
			filterSql += ' AND t.label_id = {labelId:String}';
			params.labelId = query.labelId;
		}
		if (query.releaseId) {
			filterSql += ' AND t.release_id = {releaseId:String}';
			params.releaseId = query.releaseId;
		}
		if (query.releaseType) {
			filterSql += ' AND t.release_type = {releaseType:String}';
			params.releaseType = query.releaseType;
		}
		if (query.importSource) {
			filterSql += ' AND s.import_source = {importSource:String}';
			params.importSource = query.importSource;
		}

		if (query.keyword) {
			let matchedReleaseIds =
				await this.isrcResolverService.getReleaseIdsByKeyword(
					query.keyword,
				);
			if (matchedReleaseIds.length === 0) {
				matchedReleaseIds = ['__none__'];
			}
			filterSql +=
				' AND t.release_id IN ({matchedReleaseIds:Array(String)})';
			params.matchedReleaseIds = matchedReleaseIds;
		}

		// Count query
		const countSql = queries.getRevenueTopReleaseCountQuery(filterSql);
		const countResult = await this.clickHouseService.query<{
			total: string;
		}>(countSql, params);
		const totalItems = Number(countResult[0]?.total ?? 0);

		// Data query
		const sql = queries.getRevenueTopReleaseQuery(filterSql, limit, offset);
		const rows = await this.clickHouseService.query<{
			releaseId: string;
			revenue_usd: string;
			quantity: string;
			trackCount: string;
			releaseTitle: string;
			releaseUpc: string;
			labelId: string;
			labelName: string;
			cover75: string;
			cover100: string;
			cover160: string;
			cover300: string;
			coverOriginal: string;
			releaseMetadataSpotify: string;
			releaseMetadataDeezer: string;
		}>(sql, params);

		const items: RevenueReleaseItem[] = [];
		const releaseJoinSql = `INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc`;

		if (rows.length > 0) {
			rows.forEach((r, index) => {
				items.push({
					rank: offset + index + 1,
					releaseId: r.releaseId,
					title: r.releaseTitle || 'Unknown Release',
					upc: r.releaseUpc || null,
					labelId: r.labelId || null,
					labelName: r.labelName || null,
					trackCount: Number(r.trackCount),
					revenueUsd: this.revenueNumber(r.revenue_usd),
					revenueUsdExact: this.revenueExact(r.revenue_usd),
					quantity: Number(r.quantity),
					metadataExternal: normalizeSyncedMetadataExternal(
						r.releaseMetadataSpotify,
						r.releaseMetadataDeezer,
					),
					release: {
						coverArtThumbnails: {
							'75x75': r.cover75 || null,
							'100x100': r.cover100 || null,
							'160x160': r.cover160 || null,
							'300x300': r.cover300 || null,
							original: r.coverOriginal || null,
						},
					},
				});
			});

			// groupBySource: fetch breakdown per release
			if (query.groupBySource) {
				const breakdowns = await Promise.all(
					items
						.filter((item) => item.releaseId !== 'other')
						.map((item) =>
							this.fetchSourceBreakdown(
								CLICKHOUSE_TABLES.SALES_DSP_MONTHLY,
								's.period',
								releaseJoinSql,
								filterSql,
								{ ...params },
								'AND t.release_id = {_releaseId:String}',
								{ _releaseId: item.releaseId },
								true,
							),
						),
				);
				items
					.filter((it) => it.releaseId !== 'other')
					.forEach((item, i) => {
						item.bySource = breakdowns[i];
					});
			}

			const shouldIncludeOther =
				!isPaginated && query.includeOther === true;

			if (shouldIncludeOther) {
				const totalSql =
					queries.getRevenueTopReleaseTotalQuery(filterSql);
				const totalResult = await this.clickHouseService.query<{
					total_qty: string;
					total_rev: string;
				}>(totalSql, params);
				const totalQty = Number(totalResult[0]?.total_qty ?? 0);
				const totalRevExact = this.revenueExact(
					totalResult[0]?.total_rev,
				);

				const itemsQtySum = items.reduce(
					(acc, it) => acc + it.quantity,
					0,
				);
				const itemsRevSumExact = this.addRevenueExact(
					items.map((it) => it.revenueUsdExact),
				);

				const otherQty = totalQty - itemsQtySum;
				const otherRevExact = this.subtractRevenueExact(
					totalRevExact,
					itemsRevSumExact,
				);
				const otherRev = this.revenueNumber(otherRevExact);

				if (otherQty > 0 || otherRev > 0) {
					const otherItem: RevenueReleaseItem = {
						rank: items.length + 1,
						releaseId: 'other',
						title: 'Other',
						upc: null,
						labelId: null,
						labelName: null,
						trackCount: 0,
						revenueUsd: otherRev > 0 ? otherRev : 0,
						revenueUsdExact: otherRev > 0 ? otherRevExact : '0',
						quantity: otherQty > 0 ? otherQty : 0,
						metadataExternal: {},
						release: null,
					};
					if (query.groupBySource) {
						const topReleaseIds = items
							.filter((it) => it.releaseId !== 'other')
							.map((it) => it.releaseId);
						otherItem.bySource = await this.fetchSourceBreakdown(
							CLICKHOUSE_TABLES.SALES_DSP_MONTHLY,
							's.period',
							releaseJoinSql,
							filterSql,
							{ ...params },
							topReleaseIds.length > 0
								? 'AND t.release_id NOT IN ({_topReleaseIds:Array(String)})'
								: '',
							topReleaseIds.length > 0
								? { _topReleaseIds: topReleaseIds }
								: {},
							true,
						);
					}
					items.push(otherItem);
				}
			}
		}

		if (isPaginated) {
			return new PageDto({
				items,
				metadata: { page, pageSize, totalItems },
			});
		} else {
			return new PageDto({
				items,
				metadata: { page: 0, pageSize: 0, totalItems: 0 },
			});
		}
	}

	// ═══════════════════════════════════════════════════════
	// REVENUE TOP RELEASE VIDEO (Top video releases by revenue)
	// ═══════════════════════════════════════════════════════
	async getRevenueTopReleaseVideo(
		tenantId: string,
		query: TimelineQueryDto,
	): Promise<PageDto<RevenueReleaseVideoItem>> {
		const key = this.cache.buildKey('tl:rev-top-release-video', tenantId, query);
		return this.cache.wrap(key, () =>
			this.computeRevenueTopReleaseVideo(tenantId, query),
		);
	}

	private async computeRevenueTopReleaseVideo(
		tenantId: string,
		query: TimelineQueryDto,
	): Promise<PageDto<RevenueReleaseVideoItem>> {
		const fromDate = normalizeDateToFirstOfMonth(query.fromDate);
		const toDate = normalizeDateToFirstOfMonth(query.toDate);
		const { limit, offset, page, pageSize, isPaginated } =
			this.getPaginationParams(query);
		const isSystem = checkIsSystemTenant(tenantId);

		const params: Record<string, any> = { from: fromDate, to: toDate };
		let filterSql = `AND t.is_deleted = 0`;

		if (!isSystem) {
			filterSql += ' AND t.tenant_id = {tenantId:String}';
			params.tenantId = tenantId;
		}
		if (query.labelId) {
			filterSql += ' AND t.label_id = {labelId:String}';
			params.labelId = query.labelId;
		}
		if (query.releaseId) {
			filterSql += ' AND t.release_id = {releaseId:String}';
			params.releaseId = query.releaseId;
		}
		if (query.importSource) {
			filterSql += ' AND s.import_source = {importSource:String}';
			params.importSource = query.importSource;
		}

		if (query.keyword) {
			let matchedReleaseIds =
				await this.isrcResolverService.getReleaseIdsByKeyword(
					query.keyword,
				);
			if (matchedReleaseIds.length === 0) {
				matchedReleaseIds = ['__none__'];
			}
			filterSql +=
				' AND t.release_id IN ({matchedReleaseIds:Array(String)})';
			params.matchedReleaseIds = matchedReleaseIds;
		}

		// Count query
		const countSql = queries.getRevenueTopReleaseVideoCountQuery(filterSql);
		const countResult = await this.clickHouseService.query<{
			total: string;
		}>(countSql, params);
		const totalItems = Number(countResult[0]?.total ?? 0);

		// Data query
		const sql = queries.getRevenueTopReleaseVideoQuery(filterSql, limit, offset);
		const rows = await this.clickHouseService.query<{
			releaseId: string;
			channelIds: string[];
			revenue_usd: string;
			quantity: string;
		}>(sql, params);

		const items: RevenueReleaseVideoItem[] = [];
		const releaseJoinSql = `INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc`;

		if (rows.length > 0) {
			const releaseIds = rows.map((r) => r.releaseId);
			const allChannelIds = [...new Set(rows.flatMap((r) => r.channelIds ?? []).filter(Boolean))];

			const [releasesMeta, channelsMeta, videosMeta] = await Promise.all([
				this.isrcResolverService.getReleaseMetadata(releaseIds),
				allChannelIds.length > 0
					? this.isrcResolverService.getChannelMetadata(allChannelIds)
					: Promise.resolve(new Map()),
				this.isrcResolverService.getVideoMetadataByReleaseIds(releaseIds),
			]);

			rows.forEach((r, index) => {
				const meta = releasesMeta.get(r.releaseId);
				const rowChannelIds = (r.channelIds ?? []).filter(Boolean);

				const channels: AnalyticsChannelInfo[] = rowChannelIds
					.map((id) => {
						const ch = channelsMeta.get(id);
						return ch ? { id, ...ch } : null;
					})
					.filter((c): c is AnalyticsChannelInfo => c !== null);

				const workspacesMap = new Map<string, AnalyticsWorkspaceInfo>();
				rowChannelIds.forEach((id) => {
					const ch = channelsMeta.get(id);
					const tenant = ch?.tenant;
					if (tenant && !workspacesMap.has(tenant.id)) {
						workspacesMap.set(tenant.id, tenant);
					}
				});

				items.push({
					rank: offset + index + 1,
					releaseId: r.releaseId,
					title: meta?.title ?? 'Unknown Release',
					upc: meta?.upc ?? null,
					labelId: meta?.labelId ?? null,
					labelName: meta?.labelName ?? null,
					trackCount: meta?.trackCount ?? 0,
					revenueUsd: this.revenueNumber(r.revenue_usd),
					revenueUsdExact: this.revenueExact(r.revenue_usd),
					quantity: Number(r.quantity),
					channels,
					workspaces: [...workspacesMap.values()],
					video: videosMeta.get(r.releaseId) ?? null,
					release: meta
						? { coverArtThumbnails: meta.coverArtThumbnails }
						: null,
				});
			});

			if (query.groupBySource) {
				const breakdowns = await Promise.all(
					items.map((item) =>
						this.fetchSourceBreakdown(
							CLICKHOUSE_TABLES.SALES_DSP_MONTHLY,
							's.period',
							releaseJoinSql,
							filterSql,
							{ ...params },
							'AND t.release_id = {_releaseId:String}',
							{ _releaseId: item.releaseId },
							true,
						),
					),
				);
				items.forEach((item, i) => {
					item.bySource = breakdowns[i];
				});
			}

			const shouldIncludeOther =
				!isPaginated && query.includeOther === true;

			if (shouldIncludeOther) {
				const totalSql =
					queries.getRevenueTopReleaseVideoTotalQuery(filterSql);
				const totalResult = await this.clickHouseService.query<{
					total_qty: string;
					total_rev: string;
				}>(totalSql, params);
				const totalQty = Number(totalResult[0]?.total_qty ?? 0);
				const totalRevExact = this.revenueExact(
					totalResult[0]?.total_rev,
				);

				const itemsQtySum = items.reduce(
					(acc, it) => acc + it.quantity,
					0,
				);
				const itemsRevSumExact = this.addRevenueExact(
					items.map((it) => it.revenueUsdExact),
				);

				const otherQty = totalQty - itemsQtySum;
				const otherRevExact = this.subtractRevenueExact(
					totalRevExact,
					itemsRevSumExact,
				);
				const otherRev = this.revenueNumber(otherRevExact);

				if (otherQty > 0 || otherRev > 0) {
					const otherItem: RevenueReleaseVideoItem = {
						rank: items.length + 1,
						releaseId: 'other',
						title: 'Other',
						upc: null,
						labelId: null,
						labelName: null,
						trackCount: 0,
						revenueUsd: otherRev > 0 ? otherRev : 0,
						revenueUsdExact: otherRev > 0 ? otherRevExact : '0',
						quantity: otherQty > 0 ? otherQty : 0,
						channels: [],
						workspaces: [],
						video: null,
						release: null,
					};
					if (query.groupBySource) {
						const topReleaseIds = items
							.filter((it) => it.releaseId !== 'other')
							.map((it) => it.releaseId);
						otherItem.bySource = await this.fetchSourceBreakdown(
							CLICKHOUSE_TABLES.SALES_DSP_MONTHLY,
							's.period',
							releaseJoinSql,
							filterSql,
							{ ...params },
							topReleaseIds.length > 0
								? 'AND t.release_id NOT IN ({_topReleaseIds:Array(String)})'
								: '',
							topReleaseIds.length > 0
								? { _topReleaseIds: topReleaseIds }
								: {},
							true,
						);
					}
					items.push(otherItem);
				}
			}
		}

		if (isPaginated) {
			return new PageDto({
				items,
				metadata: { page, pageSize, totalItems },
			});
		} else {
			return new PageDto({
				items,
				metadata: { page: 0, pageSize: 0, totalItems: 0 },
			});
		}
	}

	// ═══════════════════════════════════════════════════════
	// CHART API 1: TREND-VIEW LINE CHART (Monthly)
	// Tổng trend-view theo tháng từ trends_dsp_daily_cube
	// ═══════════════════════════════════════════════════════
	async getTrendViewLineChart(
		tenantId: string,
		query: ChartQueryDto,
	): Promise<TrendViewLineChartItem[]> {
		const key = this.cache.buildKey('tl:chart-trend-line', tenantId, query);
		return this.cache.wrap(key, () =>
			this.computeTrendViewLineChart(tenantId, query),
		);
	}

	private async computeTrendViewLineChart(
		tenantId: string,
		query: ChartQueryDto,
	): Promise<TrendViewLineChartItem[]> {
		const isSystem = checkIsSystemTenant(tenantId);
		const params: Record<string, any> = {
			from: query.fromDate,
			to: query.toDate,
		};

		let joinSql = '';
		let filterSql = '';
		const hasSubFilter = !!(
			query.labelId ||
			query.releaseId ||
			query.releaseType
		);

		if (!isSystem || hasSubFilter) {
			joinSql = `INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc`;
			filterSql = 'AND t.is_deleted = 0';
			if (!isSystem) {
				filterSql += ' AND t.tenant_id = {tenantId:String}';
				params.tenantId = tenantId;
			}
			if (query.labelId) {
				filterSql += ' AND t.label_id = {labelId:String}';
				params.labelId = query.labelId;
			}
			if (query.releaseId) {
				filterSql += ' AND t.release_id = {releaseId:String}';
				params.releaseId = query.releaseId;
			}
			if (query.releaseType) {
				filterSql += ' AND t.release_type = {releaseType:String}';
				params.releaseType = query.releaseType;
			}
		}

		const sql = queries.getTrendViewLineChartQuery(joinSql, filterSql);

		const rows = await this.clickHouseService.query<{
			period: string;
			total_views: string;
		}>(sql, params);

		return rows.map((r) => ({
			period: r.period,
			totalViews: Number(r.total_views),
		}));
	}

	// ═══════════════════════════════════════════════════════
	// CHART API 2: TREND-VIEW DSP BAR CHART (Top 5 + Other)
	// Tổng trend-view theo DSP, top 5 + Other
	// ═══════════════════════════════════════════════════════
	async getTrendViewDspBarChart(
		tenantId: string,
		query: ChartQueryDto,
	): Promise<DspBarChartItem[]> {
		const key = this.cache.buildKey(
			'tl:chart-trend-dsp-bar',
			tenantId,
			query,
		);
		return this.cache.wrap(key, () =>
			this.computeTrendViewDspBarChart(tenantId, query),
		);
	}

	private async computeTrendViewDspBarChart(
		tenantId: string,
		query: ChartQueryDto,
	): Promise<DspBarChartItem[]> {
		const isSystem = checkIsSystemTenant(tenantId);
		const params: Record<string, any> = {
			from: query.fromDate,
			to: query.toDate,
		};

		let filterSql = 'AND t.is_deleted = 0';
		if (!isSystem) {
			filterSql += ' AND t.tenant_id = {tenantId:String}';
			params.tenantId = tenantId;
		}
		if (query.labelId) {
			filterSql += ' AND t.label_id = {labelId:String}';
			params.labelId = query.labelId;
		}
		if (query.releaseId) {
			filterSql += ' AND t.release_id = {releaseId:String}';
			params.releaseId = query.releaseId;
		}
		if (query.releaseType) {
			filterSql += ' AND t.release_type = {releaseType:String}';
			params.releaseType = query.releaseType;
		}

		const resolvedDspName = `coalesce(nullIf(p.dsp_name, ''), nullIf(r.dsp_name, ''), s.dsp_id)`;
		const joinExpr = `
      LEFT JOIN (SELECT * FROM music_analytics.dsps_report FINAL) r ON s.dsp_id = r.id_dsps_report
      LEFT JOIN (SELECT * FROM music_analytics.pg_dsps_sync FINAL) p ON r.pg_uuid = p.pg_uuid
    `;

		// Step 1: Get total views across all DSPs
		const totalSql = queries.getTrendViewDspBarChartTotalQuery(filterSql);
		const totalResult = await this.clickHouseService.query<{
			total_views: string;
		}>(totalSql, params);
		const grandTotal = Number(totalResult[0]?.total_views ?? 0);

		// Step 2: Get top 5 DSPs
		const sql = queries.getTrendViewDspBarChartQuery(
			filterSql,
			resolvedDspName,
			joinExpr,
		);
		const rows = await this.clickHouseService.query<{
			dsp_name: string;
			total_views: string;
		}>(sql, params);

		const items: DspBarChartItem[] = rows.map((r) => ({
			dspName: r.dsp_name,
			totalViews: Number(r.total_views),
		}));

		// Step 3: Calculate Other
		const top5Total = items.reduce(
			(acc, it) => acc + (it.totalViews ?? 0),
			0,
		);
		const otherViews = grandTotal - top5Total;
		if (otherViews > 0) {
			items.push({ dspName: 'Other', totalViews: otherViews });
		}

		return items;
	}

	// ═══════════════════════════════════════════════════════
	// CHART API 3: REVENUE LINE CHART (Monthly)
	// Tổng revenue theo tháng từ sales_dsp_monthly_cube_v2
	// Vì dữ liệu sales đã aggregate theo tháng, nên lấy
	// từ đầu tháng fromDate đến cuối tháng toDate.
	// ═══════════════════════════════════════════════════════
	async getTrendViewTerritoryBarChart(
		tenantId: string,
		query: ChartQueryDto,
	): Promise<TerritoryBarChartItem[]> {
		const key = this.cache.buildKey(
			'tl:chart-trend-ter-bar',
			tenantId,
			query,
		);
		return this.cache.wrap(key, () =>
			this.computeTrendViewTerritoryBarChart(tenantId, query),
		);
	}

	private async computeTrendViewTerritoryBarChart(
		tenantId: string,
		query: ChartQueryDto,
	): Promise<TerritoryBarChartItem[]> {
		const fromDate = normalizeDateToFirstOfMonth(query.fromDate);
		const toDate = normalizeDateToFirstOfMonth(query.toDate);
		const { joinSql, filterSql, params } = this.buildTenantFilters(
			tenantId,
			query,
		);
		params.from = fromDate;
		params.to = toDate;

		const totalSql = queries.getTrendViewTerritoryBarChartTotalQuery(
			joinSql,
			filterSql,
		);
		const totalResult = await this.clickHouseService.query<{
			total_views: string;
		}>(totalSql, params);
		const grandTotal = Number(totalResult[0]?.total_views ?? 0);

		const sql = queries.getTrendViewTerritoryBarChartQuery(
			joinSql,
			filterSql,
		);
		const rows = await this.clickHouseService.query<{
			territory: string;
			total_views: string;
		}>(sql, params);

		const items: TerritoryBarChartItem[] = rows.map((r) => ({
			territory: r.territory,
			totalViews: Number(r.total_views),
		}));

		const top5Total = items.reduce(
			(acc, it) => acc + (it.totalViews ?? 0),
			0,
		);
		const otherViews = grandTotal - top5Total;
		if (otherViews > 0) {
			items.push({ territory: 'Other', totalViews: otherViews });
		}

		return this.mapTerritoryCodesToCountryNames(items);
	}

	async getRevenueLineChart(
		tenantId: string,
		query: ChartQueryDto,
	): Promise<RevenueLineChartItem[]> {
		const key = this.cache.buildKey('tl:chart-rev-line', tenantId, query);
		return this.cache.wrap(key, () =>
			this.computeRevenueLineChart(tenantId, query),
		);
	}

	private async computeRevenueLineChart(
		tenantId: string,
		query: ChartQueryDto,
	): Promise<RevenueLineChartItem[]> {
		const fromDate = normalizeDateToFirstOfMonth(query.fromDate);
		const toDate = normalizeDateToFirstOfMonth(query.toDate);
		const isSystem = checkIsSystemTenant(tenantId);
		const params: Record<string, any> = { from: fromDate, to: toDate };

		let joinSql = '';
		let filterSql = '';
		const hasSubFilter = !!(
			query.labelId ||
			query.releaseId ||
			query.releaseType
		);

		if (!isSystem || hasSubFilter) {
			joinSql = `INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc`;
			filterSql = 'AND t.is_deleted = 0';
			if (!isSystem) {
				filterSql += ' AND t.tenant_id = {tenantId:String}';
				params.tenantId = tenantId;
			}
			if (query.labelId) {
				filterSql += ' AND t.label_id = {labelId:String}';
				params.labelId = query.labelId;
			}
			if (query.releaseId) {
				filterSql += ' AND t.release_id = {releaseId:String}';
				params.releaseId = query.releaseId;
			}
			if (query.releaseType) {
				filterSql += ' AND t.release_type = {releaseType:String}';
				params.releaseType = query.releaseType;
			}
		}

		const sql = queries.getRevenueLineChartQuery(joinSql, filterSql);

		const rows = await this.clickHouseService.query<{
			period: string;
			revenue_usd: string;
			quantity: string;
		}>(sql, params);

		return rows.map((r) => ({
			period: r.period,
			revenueUsd: this.revenueNumber(r.revenue_usd),
			revenueUsdExact: this.revenueExact(r.revenue_usd),
			quantity: Number(r.quantity),
		}));
	}

	// ═══════════════════════════════════════════════════════
	// CHART API 4: REVENUE DSP BAR CHART (Top 5 + Other)
	// Tổng revenue theo DSP, top 5 + Other
	// ═══════════════════════════════════════════════════════
	async getRevenueDspBarChart(
		tenantId: string,
		query: ChartQueryDto,
	): Promise<DspBarChartItem[]> {
		const key = this.cache.buildKey(
			'tl:chart-rev-dsp-bar',
			tenantId,
			query,
		);
		return this.cache.wrap(key, () =>
			this.computeRevenueDspBarChart(tenantId, query),
		);
	}

	private async computeRevenueDspBarChart(
		tenantId: string,
		query: ChartQueryDto,
	): Promise<DspBarChartItem[]> {
		const fromDate = normalizeDateToFirstOfMonth(query.fromDate);
		const toDate = normalizeDateToFirstOfMonth(query.toDate);
		const isSystem = checkIsSystemTenant(tenantId);
		const params: Record<string, any> = { from: fromDate, to: toDate };

		let joinSql = '';
		let filterSql = '';
		const hasSubFilter = !!(
			query.labelId ||
			query.releaseId ||
			query.releaseType
		);

		if (!isSystem || hasSubFilter) {
			joinSql = `INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc`;
			filterSql = 'AND t.is_deleted = 0';
			if (!isSystem) {
				filterSql += ' AND t.tenant_id = {tenantId:String}';
				params.tenantId = tenantId;
			}
			if (query.labelId) {
				filterSql += ' AND t.label_id = {labelId:String}';
				params.labelId = query.labelId;
			}
			if (query.releaseId) {
				filterSql += ' AND t.release_id = {releaseId:String}';
				params.releaseId = query.releaseId;
			}
			if (query.releaseType) {
				filterSql += ' AND t.release_type = {releaseType:String}';
				params.releaseType = query.releaseType;
			}
		}

		const resolvedDspName = `coalesce(nullIf(p.dsp_name, ''), nullIf(r.dsp_name, ''), s.dsp_id)`;
		const joinExpr = `
      LEFT JOIN (SELECT * FROM music_analytics.dsps_report FINAL) r ON s.dsp_id = r.id_dsps_report
      LEFT JOIN (SELECT * FROM music_analytics.pg_dsps_sync FINAL) p ON r.pg_uuid = p.pg_uuid
    `;

		// Step 1: Get total revenue across all DSPs
		const totalSql = queries.getRevenueDspBarChartTotalQuery(
			joinSql,
			filterSql,
		);
		const totalResult = await this.clickHouseService.query<{
			total_rev: string;
		}>(totalSql, params);
		const grandTotalExact = this.revenueExact(totalResult[0]?.total_rev);

		// Step 2: Get top 5 DSPs by revenue
		const sql = queries.getRevenueDspBarChartQuery(
			joinSql,
			joinExpr,
			filterSql,
			resolvedDspName,
		);
		const rows = await this.clickHouseService.query<{
			dsp_name: string;
			revenue_usd: string;
		}>(sql, params);

		const items: DspBarChartItem[] = rows.map((r) => ({
			dspName: r.dsp_name,
			totalViews: undefined, // ensure matching expected type
			revenueUsd: this.revenueNumber(r.revenue_usd),
			revenueUsdExact: this.revenueExact(r.revenue_usd),
		}));

		// Step 3: Calculate Other
		const top5TotalExact = this.addRevenueExact(
			items.map((it) => it.revenueUsdExact),
		);
		const otherRevExact = this.subtractRevenueExact(
			grandTotalExact,
			top5TotalExact,
		);
		const otherRev = this.revenueNumber(otherRevExact);
		if (otherRev > 0) {
			items.push({
				dspName: 'Other',
				revenueUsd: otherRev,
				revenueUsdExact: otherRevExact,
			});
		}

		return items;
	}

	async getRevenueTerritoryBarChart(
		tenantId: string,
		query: ChartQueryDto,
	): Promise<TerritoryBarChartItem[]> {
		const key = this.cache.buildKey(
			'tl:chart-rev-ter-bar',
			tenantId,
			query,
		);
		return this.cache.wrap(key, () =>
			this.computeRevenueTerritoryBarChart(tenantId, query),
		);
	}

	private async computeRevenueTerritoryBarChart(
		tenantId: string,
		query: ChartQueryDto,
	): Promise<TerritoryBarChartItem[]> {
		const fromDate = normalizeDateToFirstOfMonth(query.fromDate);
		const toDate = normalizeDateToFirstOfMonth(query.toDate);
		const { joinSql, filterSql, params } = this.buildTenantFilters(
			tenantId,
			query,
		);
		params.from = fromDate;
		params.to = toDate;

		const totalSql = queries.getRevenueTerritoryBarChartTotalQuery(
			joinSql,
			filterSql,
		);
		const totalResult = await this.clickHouseService.query<{
			total_rev: string;
		}>(totalSql, params);
		const grandTotalExact = this.revenueExact(totalResult[0]?.total_rev);

		const sql = queries.getRevenueTerritoryBarChartQuery(
			joinSql,
			filterSql,
		);
		const rows = await this.clickHouseService.query<{
			territory: string;
			revenue_usd: string;
		}>(sql, params);

		const items: TerritoryBarChartItem[] = rows.map((r) => ({
			territory: r.territory,
			revenueUsd: this.revenueNumber(r.revenue_usd),
			revenueUsdExact: this.revenueExact(r.revenue_usd),
		}));

		const top5TotalExact = this.addRevenueExact(
			items.map((it) => it.revenueUsdExact),
		);
		const otherRevExact = this.subtractRevenueExact(
			grandTotalExact,
			top5TotalExact,
		);
		const otherRev = this.revenueNumber(otherRevExact);
		if (otherRev > 0) {
			items.push({
				territory: 'Other',
				revenueUsd: otherRev,
				revenueUsdExact: otherRevExact,
			});
		}

		return this.mapTerritoryCodesToCountryNames(items);
	}

	private async mapTerritoryCodesToCountryNames(
		items: TerritoryBarChartItem[],
	): Promise<TerritoryBarChartItem[]> {
		const iso2Codes = Array.from(
			new Set(
				items
					.map((item) => item.territory?.trim().toUpperCase())
					.filter(
						(territory): territory is string =>
							!!territory && territory !== 'OTHER',
					),
			),
		);

		if (!iso2Codes.length) return items;

		const countries = await this.entityManager.query(
			`
        SELECT UPPER(iso2) AS iso2, name
        FROM countries
        WHERE UPPER(iso2) = ANY($1)
      `,
			[iso2Codes],
		);
		const countryNameByIso2 = new Map(
			countries.map((country: { iso2: string; name: string }) => [country.iso2, country.name]),
		);

		return items.map((item) => {
			const iso2 = item.territory?.trim().toUpperCase();
			const territory =
				(iso2 && iso2 !== 'OTHER'
					? (countryNameByIso2.get(iso2) ?? item.territory)
					: item.territory) as string;
			return {
				...item,
				territory,
			};
		});
	}
}
