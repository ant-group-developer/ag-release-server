import { Injectable } from '@nestjs/common';
import { ClickHouseService } from 'src/modules/clickhouse/clickhouse.service';
import { CLICKHOUSE_TABLES } from 'src/modules/clickhouse/clickhouse.constants';
import { checkIsSystemTenant } from 'src/modules/user/utils/user-type.util';
import { normalizeDateToFirstOfMonth } from 'src/utils/util.date';
import {
	EntityOverviewQueryDto,
	EntityTimelineQueryDto,
} from '../dto/analytics-query.dto';
import {
	DspTimelinePeriod,
	DspTimelineResponse,
	EntityOverviewResponse,
	RevenueTimelineResponse,
} from '../interfaces/analytics.interface';

export type EntityType = 'release' | 'label' | 'artist' | 'track';

@Injectable()
export class EntityAnalyticsService {
	constructor(private readonly clickHouseService: ClickHouseService) {}

	private revenueNumber(value?: string | null): number {
		return Number(value ?? 0);
	}

	private revenueExact(value?: string | null): string {
		return value?.toString() ?? '0';
	}

	private addRevenueExact(values: Array<string | null | undefined>): string {
		const decimals = values.map((value) => this.revenueExact(value));
		const scale = Math.max(0, ...decimals.map((value) => (value.split('.')[1] || '').length));
		let sum = 0n;

		for (const value of decimals) {
			const negative = value.trim().startsWith('-');
			const unsigned = negative ? value.trim().slice(1) : value.trim();
			const [whole = '0', frac = ''] = unsigned.split('.');
			const units = BigInt(`${whole || '0'}${frac.padEnd(scale, '0') || ''}`);
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

	// ─────────────────────────────────────────────────────
	// Helper: build JOIN + WHERE scoped theo entity + tenant
	// ─────────────────────────────────────────────────────

	private buildEntityFilters(
		tenantId: string,
		entityType: EntityType,
		entityId?: string,
	): {
		joinSql: string;
		filterSql: string;
		params: Record<string, any>;
	} {
		const isSystem = checkIsSystemTenant(tenantId);
		const params: Record<string, any> = { entityId };

		// Track + system tenant: filter trực tiếp trên s.isrc, không cần JOIN
		if (entityType === 'track' && isSystem) {
			return {
				joinSql: '',
				filterSql: 'AND s.isrc = {entityId:String}',
				params,
			};
		}

		const joinSql = `INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc`;
		let filterSql = 'AND t.is_deleted = 0';

		if (!isSystem) {
			filterSql += ' AND t.tenant_id = {tenantId:String}';
			params.tenantId = tenantId;
		}

		switch (entityType) {
			case 'release':
				filterSql += ' AND t.release_id = {entityId:String}';
				break;
			case 'label':
				filterSql += ' AND t.label_id = {entityId:String}';
				break;
			case 'artist':
				filterSql += ' AND has(t.artist_ids, {entityId:String})';
				break;
			case 'track':
				// Normal tenant: tenant check qua JOIN, entity filter trên isrc
				filterSql += ' AND s.isrc = {entityId:String}';
				break;
		}

		return { joinSql, filterSql, params };
	}

	// DSP name resolution constants (dùng lại pattern từ global-timeline.service)
	private readonly resolvedDspName = `coalesce(nullIf(p.dsp_name, ''), nullIf(r.dsp_name, ''), s.dsp_id)`;
	private readonly dspNameJoin = `
    LEFT JOIN (SELECT * FROM music_analytics.dsps_report FINAL) r ON s.dsp_id = r.id_dsps_report
    LEFT JOIN (SELECT * FROM music_analytics.pg_dsps_sync FINAL) p ON r.pg_uuid = p.pg_uuid
  `;

	// ─────────────────────────────────────────────────────
	// OVERVIEW (tổng trend views + sales views + revenue)
	// 2 query song song: trends_dsp_monthly + sales_dsp_monthly
	// ─────────────────────────────────────────────────────

	async getOverview(
		entityType: EntityType,
		entityId: string,
		dto: EntityOverviewQueryDto,
		tenantId: string,
	): Promise<EntityOverviewResponse> {
		const fromDate = normalizeDateToFirstOfMonth(dto.fromDate);
		const toDate = normalizeDateToFirstOfMonth(dto.toDate);
		const { joinSql, filterSql, params } = this.buildEntityFilters(
			tenantId,
			entityType,
			entityId,
		);
		params.from = fromDate;
		params.to = toDate;

		const trendSql = `
      SELECT sum(s.total_quantity) AS total_trend_views
      FROM ${CLICKHOUSE_TABLES.TRENDS_DSP_MONTHLY} s
      ${joinSql}
      WHERE s.period >= toDate({from:String}) AND s.period <= toDate({to:String})
        ${filterSql}
    `;
		const salesSql = `
      SELECT
        sum(s.total_quantity) AS total_sales_views,
        sum(s.total_revenue_usd) AS total_revenue_usd
      FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
      ${joinSql}
      WHERE s.period >= toDate({from:String}) AND s.period <= toDate({to:String})
        ${filterSql}
    `;

		const [trendRows, salesRows] = await Promise.all([
			this.clickHouseService.query<{ total_trend_views: string }>(
				trendSql,
				params,
			),
			this.clickHouseService.query<{
				total_sales_views: string;
				total_revenue_usd: string;
			}>(salesSql, params),
		]);

		return {
			totalTrendViews: Number(trendRows[0]?.total_trend_views ?? 0),
			totalSalesViews: Number(salesRows[0]?.total_sales_views ?? 0),
			totalRevenueUsd: this.revenueNumber(salesRows[0]?.total_revenue_usd),
			totalRevenueUsdExact: this.revenueExact(salesRows[0]?.total_revenue_usd),
		};
	}

	// ─────────────────────────────────────────────────────
	// TREND VIEW DSP TIMELINE (monthly)
	// Table: trends_dsp_monthly_cube | period column: period
	// ─────────────────────────────────────────────────────
	async getTrendViewDspTimeline(
		entityType: EntityType,
		entityId: string,
		dto: EntityTimelineQueryDto,
		tenantId: string,
	): Promise<DspTimelineResponse> {
		const fromDate = normalizeDateToFirstOfMonth(dto.fromDate);
		const toDate = normalizeDateToFirstOfMonth(dto.toDate);
		const { topN = 5, includeOther = true } = dto;
		const { joinSql, filterSql, params } = this.buildEntityFilters(
			tenantId,
			entityType,
			entityId,
		);
		params.from = fromDate;
		params.to = toDate;

		const topDspsSql = `
      SELECT s.dsp_id, ${this.resolvedDspName} AS dsp_name, sum(s.total_quantity) AS views
      FROM ${CLICKHOUSE_TABLES.TRENDS_DSP_MONTHLY} s
      ${joinSql}
      ${this.dspNameJoin}
      WHERE s.period >= toDate({from:String}) AND s.period <= toDate({to:String})
        ${filterSql}
      GROUP BY s.dsp_id, dsp_name
      ORDER BY views DESC
      LIMIT ${topN}
    `;
		const topDspsRows = await this.clickHouseService.query<{
			dsp_id: string;
			dsp_name: string;
		}>(topDspsSql, params);
		const topDspIds = topDspsRows.map((r) => r.dsp_id);
		const topDsps = topDspsRows.map((r) => r.dsp_name);
		if (!topDspIds.length) return { topDsps: [], items: [] };

		params.topDsps = topDspIds;
		const dspExpr = includeOther
			? `multiIf(s.dsp_id IN ({topDsps:Array(String)}), ${this.resolvedDspName}, 'Other') AS dsp_name`
			: `${this.resolvedDspName} AS dsp_name`;
		const whereDsp = includeOther
			? ''
			: 'AND s.dsp_id IN ({topDsps:Array(String)})';

		const timelineSql = `
      SELECT
        toStartOfMonth(s.period) AS period_date,
        formatDateTime(s.period, '%Y-%m') AS period_str,
        ${dspExpr},
        sum(s.total_quantity) AS trend_views
      FROM ${CLICKHOUSE_TABLES.TRENDS_DSP_MONTHLY} s
      ${joinSql}
      ${this.dspNameJoin}
      WHERE s.period >= toDate({from:String}) AND s.period <= toDate({to:String})
        ${whereDsp} ${filterSql}
      GROUP BY period_date, period_str, dsp_name
      ORDER BY period_date ASC, trend_views DESC
    `;
		const rows = await this.clickHouseService.query<{
			period_str: string;
			dsp_name: string;
			trend_views: string;
		}>(timelineSql, params);

		const periodMap = new Map<string, DspTimelinePeriod>();
		for (const row of rows) {
			let p = periodMap.get(row.period_str);
			if (!p) {
				p = { period: row.period_str, series: [] };
				periodMap.set(row.period_str, p);
			}
			p.series.push({
				dsp: row.dsp_name,
				trendViews: Number(row.trend_views),
			});
		}
		return { topDsps, items: Array.from(periodMap.values()) };
	}

	// ─────────────────────────────────────────────────────
	// SALES VIEW DSP TIMELINE (monthly)
	// Table: sales_dsp_monthly_cube_v2 | period column: period
	// ─────────────────────────────────────────────────────
	async getSalesViewDspTimeline(
		entityType: EntityType,
		entityId: string,
		dto: EntityTimelineQueryDto,
		tenantId: string,
	): Promise<DspTimelineResponse> {
		const fromDate = normalizeDateToFirstOfMonth(dto.fromDate);
		const toDate = normalizeDateToFirstOfMonth(dto.toDate);
		const { topN = 5, includeOther = true } = dto;
		const { joinSql, filterSql, params } = this.buildEntityFilters(
			tenantId,
			entityType,
			entityId,
		);
		params.from = fromDate;
		params.to = toDate;

		const topDspsSql = `
      SELECT s.dsp_id, ${this.resolvedDspName} AS dsp_name, sum(s.total_quantity) AS views
      FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
      ${joinSql}
      ${this.dspNameJoin}
      WHERE s.period >= toDate({from:String}) AND s.period <= toDate({to:String})
        ${filterSql}
      GROUP BY s.dsp_id, dsp_name
      ORDER BY views DESC
      LIMIT ${topN}
    `;
		const topDspsRows = await this.clickHouseService.query<{
			dsp_id: string;
			dsp_name: string;
		}>(topDspsSql, params);
		const topDspIds = topDspsRows.map((r) => r.dsp_id);
		const topDsps = topDspsRows.map((r) => r.dsp_name);
		if (!topDspIds.length) return { topDsps: [], items: [] };

		params.topDsps = topDspIds;
		const dspExpr = includeOther
			? `multiIf(s.dsp_id IN ({topDsps:Array(String)}), ${this.resolvedDspName}, 'Other') AS dsp_name`
			: `${this.resolvedDspName} AS dsp_name`;
		const whereDsp = includeOther
			? ''
			: 'AND s.dsp_id IN ({topDsps:Array(String)})';

		const timelineSql = `
      SELECT
        toStartOfMonth(s.period) AS period_date,
        formatDateTime(s.period, '%Y-%m') AS period_str,
        ${dspExpr},
        sum(s.total_quantity) AS sales_views,
        sum(s.total_revenue_usd) AS revenue_usd
      FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
      ${joinSql}
      ${this.dspNameJoin}
      WHERE s.period >= toDate({from:String}) AND s.period <= toDate({to:String})
        ${whereDsp} ${filterSql}
      GROUP BY period_date, period_str, dsp_name
      ORDER BY period_date ASC, sales_views DESC
    `;
		const rows = await this.clickHouseService.query<{
			period_str: string;
			dsp_name: string;
			sales_views: string;
			revenue_usd: string;
		}>(timelineSql, params);

		const periodMap = new Map<string, DspTimelinePeriod>();
		for (const row of rows) {
			let p = periodMap.get(row.period_str);
			if (!p) {
				p = { period: row.period_str, series: [] };
				periodMap.set(row.period_str, p);
			}
			p.series.push({
				dsp: row.dsp_name,
				salesViews: Number(row.sales_views),
				revenueUsd: this.revenueNumber(row.revenue_usd),
				revenueUsdExact: this.revenueExact(row.revenue_usd),
			});
		}
		return { topDsps, items: Array.from(periodMap.values()) };
	}

	// ─────────────────────────────────────────────────────
	// TREND VIEW DSP DAILY TIMELINE
	// Table: trends_dsp_daily_cube | date column: reporting_date
	// ─────────────────────────────────────────────────────
	async getTrendViewDspDailyTimeline(
		entityType: EntityType,
		entityId: string,
		dto: EntityTimelineQueryDto,
		tenantId: string,
	): Promise<DspTimelineResponse> {
		const { fromDate, toDate, topN = 5, includeOther = true } = dto;
		const { joinSql, filterSql, params } = this.buildEntityFilters(
			tenantId,
			entityType,
			entityId,
		);
		params.from = fromDate;
		params.to = toDate;

		const topDspsSql = `
      SELECT s.dsp_id, ${this.resolvedDspName} AS dsp_name, sum(s.total_quantity) AS views
      FROM ${CLICKHOUSE_TABLES.TRENDS_DSP_DAILY_CUBE} s
      ${joinSql}
      ${this.dspNameJoin}
      WHERE s.reporting_date >= toDate({from:String}) AND s.reporting_date <= toDate({to:String})
        ${filterSql}
      GROUP BY s.dsp_id, dsp_name
      ORDER BY views DESC
      LIMIT ${topN}
    `;
		const topDspsRows = await this.clickHouseService.query<{
			dsp_id: string;
			dsp_name: string;
		}>(topDspsSql, params);
		const topDspIds = topDspsRows.map((r) => r.dsp_id);
		const topDsps = topDspsRows.map((r) => r.dsp_name);
		if (!topDspIds.length) return { topDsps: [], items: [] };

		params.topDsps = topDspIds;
		const dspExpr = includeOther
			? `multiIf(s.dsp_id IN ({topDsps:Array(String)}), ${this.resolvedDspName}, 'Other') AS dsp_name`
			: `${this.resolvedDspName} AS dsp_name`;
		const whereDsp = includeOther
			? ''
			: 'AND s.dsp_id IN ({topDsps:Array(String)})';

		const timelineSql = `
      SELECT
        s.reporting_date AS period_date,
        formatDateTime(s.reporting_date, '%Y-%m-%d') AS period_str,
        ${dspExpr},
        sum(s.total_quantity) AS trend_views
      FROM ${CLICKHOUSE_TABLES.TRENDS_DSP_DAILY_CUBE} s
      ${joinSql}
      ${this.dspNameJoin}
      WHERE s.reporting_date >= toDate({from:String}) AND s.reporting_date <= toDate({to:String})
        ${whereDsp} ${filterSql}
      GROUP BY period_date, period_str, dsp_name
      ORDER BY period_date ASC, trend_views DESC
    `;
		const rows = await this.clickHouseService.query<{
			period_str: string;
			dsp_name: string;
			trend_views: string;
		}>(timelineSql, params);

		const periodMap = new Map<string, DspTimelinePeriod>();
		for (const row of rows) {
			let p = periodMap.get(row.period_str);
			if (!p) {
				p = { period: row.period_str, series: [] };
				periodMap.set(row.period_str, p);
			}
			p.series.push({
				dsp: row.dsp_name,
				trendViews: Number(row.trend_views),
			});
		}
		return { topDsps, items: Array.from(periodMap.values()) };
	}

	// ─────────────────────────────────────────────────────
	// REVENUE TIMELINE (monthly, DSP breakdown)
	// Table: sales_dsp_monthly_cube_v2
	// ─────────────────────────────────────────────────────
	async getRevenueTimeline(
		entityType: EntityType,
		entityId: string,
		dto: EntityTimelineQueryDto,
		tenantId: string,
	): Promise<RevenueTimelineResponse> {
		const fromDate = normalizeDateToFirstOfMonth(dto.fromDate);
		const toDate = normalizeDateToFirstOfMonth(dto.toDate);
		const { topN = 5, includeOther = true } = dto;
		const { joinSql, filterSql, params } = this.buildEntityFilters(
			tenantId,
			entityType,
			entityId,
		);
		params.from = fromDate;
		params.to = toDate;

		const topDspsSql = `
      SELECT s.dsp_id, ${this.resolvedDspName} AS dsp_name, sum(s.total_revenue_usd) AS revenue
      FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
      ${joinSql}
      ${this.dspNameJoin}
      WHERE s.period >= toDate({from:String}) AND s.period <= toDate({to:String})
        ${filterSql}
      GROUP BY s.dsp_id, dsp_name
      ORDER BY revenue DESC
      LIMIT ${topN}
    `;
		const topDspsRows = await this.clickHouseService.query<{
			dsp_id: string;
			dsp_name: string;
		}>(topDspsSql, params);
		const topDspIds = topDspsRows.map((r) => r.dsp_id);
		const topDsps = topDspsRows.map((r) => r.dsp_name);
		if (!topDspIds.length) return { topDsps: [], items: [] };

		params.topDsps = topDspIds;
		const dspExpr = includeOther
			? `multiIf(s.dsp_id IN ({topDsps:Array(String)}), ${this.resolvedDspName}, 'Other') AS dsp_name`
			: `${this.resolvedDspName} AS dsp_name`;
		const whereDsp = includeOther
			? ''
			: 'AND s.dsp_id IN ({topDsps:Array(String)})';

		const timelineSql = `
      SELECT
        toStartOfMonth(s.period) AS period_date,
        formatDateTime(s.period, '%Y-%m') AS period_str,
        ${dspExpr},
        sum(s.total_quantity) AS quantity,
        sum(s.total_revenue_usd) AS revenue_usd
      FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
      ${joinSql}
      ${this.dspNameJoin}
      WHERE s.period >= toDate({from:String}) AND s.period <= toDate({to:String})
        ${whereDsp} ${filterSql}
      GROUP BY period_date, period_str, dsp_name
      ORDER BY period_date ASC, revenue_usd DESC
    `;
		const rows = await this.clickHouseService.query<{
			period_str: string;
			dsp_name: string;
			quantity: string;
			revenue_usd: string;
		}>(timelineSql, params);

		const periodMap = new Map<
			string,
			{
				revenueUsdExactParts: string[];
				quantity: number;
				series: { dsp: string; revenueUsd: number; revenueUsdExact: string; quantity: number }[];
			}
		>();
		for (const row of rows) {
			let p = periodMap.get(row.period_str);
			if (!p) {
				p = { revenueUsdExactParts: [], quantity: 0, series: [] };
				periodMap.set(row.period_str, p);
			}
			const revExact = this.revenueExact(row.revenue_usd);
			const rev = this.revenueNumber(row.revenue_usd);
			const qty = Number(row.quantity);
			p.revenueUsdExactParts.push(revExact);
			p.quantity += qty;
			p.series.push({
				dsp: row.dsp_name,
				revenueUsd: rev,
				revenueUsdExact: revExact,
				quantity: qty,
			});
		}
		return {
			topDsps,
			items: Array.from(periodMap.entries()).map(([key, val]) => ({
				period: key,
				revenueUsd: this.revenueNumber(this.addRevenueExact(val.revenueUsdExactParts)),
				revenueUsdExact: this.addRevenueExact(val.revenueUsdExactParts),
				quantity: val.quantity,
				series: val.series,
			})),
		};
	}
}
