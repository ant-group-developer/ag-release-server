import { Injectable, Logger } from '@nestjs/common';
import { ClickHouseService } from 'src/modules/clickhouse/clickhouse.service';
import { CLICKHOUSE_TABLES } from 'src/modules/clickhouse/clickhouse.constants';
import { checkIsSystemTenant } from 'src/modules/user/utils/user-type.util';
import { IsrcResolverService } from './isrc-resolver.service';
import { TimelineQueryDto } from '../dto/analytics-query.dto';
import { normalizeDateToFirstOfMonth } from 'src/utils/util.date';
import {
  DspTimelineResponse,
  DspTimelinePeriod,
  TerTimelineResponse,
  TerTimelinePeriod,
  RevenueOverviewResponse,
  RevenueTimelineResponse,
  RevenueTopDspResponse,
  RevenueTopArtistResponse,
  RevenueTopTrackResponse,
  RevenueTrackItem,
} from '../interfaces/analytics.interface';

@Injectable()
export class TimelineAnalyticsService {
  private readonly logger = new Logger(TimelineAnalyticsService.name);

  constructor(
    private readonly clickHouseService: ClickHouseService,
    private readonly isrcResolverService: IsrcResolverService,
  ) { }

  // ═══════════════════════════════════════════════════════
  // Helper: Xay dung menh de WHERE cho phan quyen Tenant
  // System-tenant không có sub-filter → bỏ JOIN pg_tracks_sync
  // để thống kê TẤT CẢ ISRCs trong ClickHouse
  // ═══════════════════════════════════════════════════════
  private buildTenantFilters(
    tenantId: string,
    query: TimelineQueryDto,
  ): { joinSql: string; filterSql: string; params: Record<string, any> } {
    const params: Record<string, any> = {};
    let filterSql = '';

    const isSystem = checkIsSystemTenant(tenantId);
    const hasSubFilter = !!(query.labelId || query.releaseId);

    // System-tenant WITHOUT sub-filters → skip pg_tracks_sync JOIN entirely
    if (isSystem && !hasSubFilter) {
      return { joinSql: '', filterSql: '', params };
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

    return { joinSql, filterSql, params };
  }

  // ═══════════════════════════════════════════════════════
  // DSP SALES TIMELINE (Có Doanh thu + Lượt nghe đối soát)
  // ═══════════════════════════════════════════════════════
  async getDspSalesTimeline(
    tenantId: string,
    query: TimelineQueryDto,
  ): Promise<DspTimelineResponse> {
    const fromDate = normalizeDateToFirstOfMonth(query.fromDate);
    const toDate = normalizeDateToFirstOfMonth(query.toDate);
    const { topN = 5, includeOther = true } = query;
    const { joinSql, filterSql, params } = this.buildTenantFilters(tenantId, query);
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
    const topDspsSql = `
      SELECT
        s.dsp_id AS dsp_id,
        ${resolvedDspName} AS dsp_name,
        sum(s.total_quantity) AS views
      FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
      ${joinSql}
      ${joinExpr}
      WHERE 1=1
        AND s.period >= toDate({from:String})
        AND s.period <= toDate({to:String})
        ${filterSql}
      GROUP BY s.dsp_id, dsp_name
      ORDER BY views DESC
      LIMIT ${topN}
    `;
    const topDspsRows = await this.clickHouseService.query<{ dsp_id: string; dsp_name: string }>(
      topDspsSql,
      params,
    );
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

    const timelineSql = `
      SELECT
        toStartOfMonth(s.period) AS period_date,
        formatDateTime(s.period, '%Y-%m') AS period_str,
        ${dspExpr},
        sum(s.total_quantity) AS sales_views,
        sum(s.total_revenue_usd) AS revenue_usd
      FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
      ${joinSql}
      ${joinExpr}
      WHERE 1=1
        AND s.period >= toDate({from:String})
        AND s.period <= toDate({to:String})
        ${whereDsp}
        ${filterSql}
      GROUP BY period_date, period_str, dsp_name
      ORDER BY period_date ASC, sales_views DESC
    `;

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
        revenueUsd: Number(row.revenue_usd),
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
    const fromDate = normalizeDateToFirstOfMonth(query.fromDate);
    const toDate = normalizeDateToFirstOfMonth(query.toDate);
    const { topN = 5, includeOther = true } = query;
    const { joinSql, filterSql, params } = this.buildTenantFilters(tenantId, query);
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
    const topDspsSql = `
      SELECT
        s.dsp_id AS dsp_id,
        ${resolvedDspName} AS dsp_name,
        sum(s.total_quantity) AS views
      FROM ${CLICKHOUSE_TABLES.TRENDS_DSP_MONTHLY} s
      ${joinSql}
      ${joinExpr}
      WHERE 1=1
        AND s.period >= toDate({from:String})
        AND s.period <= toDate({to:String})
        ${filterSql}
      GROUP BY s.dsp_id, dsp_name
      ORDER BY views DESC
      LIMIT ${topN}
    `;
    const topDspsRows = await this.clickHouseService.query<{ dsp_id: string; dsp_name: string }>(
      topDspsSql,
      params,
    );
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

    const timelineSql = `
      SELECT
        toStartOfMonth(s.period) AS period_date,
        formatDateTime(s.period, '%Y-%m') AS period_str,
        ${dspExpr},
        sum(s.total_quantity) AS trend_views
      FROM ${CLICKHOUSE_TABLES.TRENDS_DSP_MONTHLY} s
      ${joinSql}
      ${joinExpr}
      WHERE 1=1
        AND s.period >= toDate({from:String})
        AND s.period <= toDate({to:String})
        ${whereDsp}
        ${filterSql}
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
    const { fromDate, toDate, topN = 5, includeOther = true } = query;
    const { joinSql, filterSql, params } = this.buildTenantFilters(tenantId, query);
    params.from = fromDate;
    params.to = toDate;

    const joinExpr = `
      LEFT JOIN (SELECT * FROM music_analytics.dsps_report FINAL) r ON s.dsp_id = r.id_dsps_report
      LEFT JOIN (SELECT * FROM music_analytics.pg_dsps_sync FINAL) p ON r.pg_uuid = p.pg_uuid
    `;

    const resolvedDspName = `coalesce(nullIf(p.dsp_name, ''), nullIf(r.dsp_name, ''), s.dsp_id)`;
    const dspNameExpr = `${resolvedDspName} AS dsp_name`;

    // 1. Tim Top N DSPs trends daily
    const topDspsSql = `
      SELECT
        s.dsp_id AS dsp_id,
        ${resolvedDspName} AS dsp_name,
        sum(s.total_quantity) AS views
      FROM ${CLICKHOUSE_TABLES.TRENDS_DSP_DAILY_CUBE} s
      ${joinSql}
      ${joinExpr}
      WHERE 1=1
        AND s.reporting_date >= toDate({from:String})
        AND s.reporting_date <= toDate({to:String})
        ${filterSql}
      GROUP BY s.dsp_id, dsp_name
      ORDER BY views DESC
      LIMIT ${topN}
    `;
    const topDspsRows = await this.clickHouseService.query<{ dsp_id: string; dsp_name: string }>(
      topDspsSql,
      params,
    );
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

    const timelineSql = `
      SELECT
        s.reporting_date AS period_date,
        formatDateTime(s.reporting_date, '%Y-%m-%d') AS period_str,
        ${dspExpr},
        sum(s.total_quantity) AS trend_views
      FROM ${CLICKHOUSE_TABLES.TRENDS_DSP_DAILY_CUBE} s
      ${joinSql}
      ${joinExpr}
      WHERE 1=1
        AND s.reporting_date >= toDate({from:String})
        AND s.reporting_date <= toDate({to:String})
        ${whereDsp}
        ${filterSql}
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
    const fromDate = normalizeDateToFirstOfMonth(query.fromDate);
    const toDate = normalizeDateToFirstOfMonth(query.toDate);
    const { topN = 5, includeOther = true } = query;
    const { joinSql, filterSql, params } = this.buildTenantFilters(tenantId, query);
    params.from = fromDate;
    params.to = toDate;

    // 1. Tim Top N Territories
    const topTersSql = `
      SELECT
        s.territory_code AS territory,
        sum(s.total_quantity) AS views
      FROM ${CLICKHOUSE_TABLES.SALES_TER_MONTHLY} s
      ${joinSql}
      WHERE 1=1
        AND s.period >= toDate({from:String})
        AND s.period <= toDate({to:String})
        ${filterSql}
      GROUP BY territory
      ORDER BY views DESC
      LIMIT ${topN}
    `;
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

    const timelineSql = `
      SELECT
        toStartOfMonth(s.period) AS period_date,
        formatDateTime(s.period, '%Y-%m') AS period_str,
        ${terExpr} AS ter_name,
        sum(s.total_quantity) AS sales_views,
        sum(s.total_revenue_usd) AS revenue_usd
      FROM ${CLICKHOUSE_TABLES.SALES_TER_MONTHLY} s
      ${joinSql}
      WHERE 1=1
        AND s.period >= toDate({from:String})
        AND s.period <= toDate({to:String})
        ${whereTer}
        ${filterSql}
      GROUP BY period_date, period_str, ter_name
      ORDER BY period_date ASC, sales_views DESC
    `;

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
        revenueUsd: Number(row.revenue_usd),
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
    const fromDate = normalizeDateToFirstOfMonth(query.fromDate);
    const toDate = normalizeDateToFirstOfMonth(query.toDate);
    const { topN = 5, includeOther = true } = query;
    const { joinSql, filterSql, params } = this.buildTenantFilters(tenantId, query);
    params.from = fromDate;
    params.to = toDate;

    // 1. Tim Top N Territories
    const topTersSql = `
      SELECT
        s.territory_code AS territory,
        sum(s.total_quantity) AS views
      FROM ${CLICKHOUSE_TABLES.TRENDS_TER_MONTHLY} s
      ${joinSql}
      WHERE 1=1
        AND s.period >= toDate({from:String})
        AND s.period <= toDate({to:String})
        ${filterSql}
      GROUP BY territory
      ORDER BY views DESC
      LIMIT ${topN}
    `;
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

    const timelineSql = `
      SELECT
        toStartOfMonth(s.period) AS period_date,
        formatDateTime(s.period, '%Y-%m') AS period_str,
        ${terExpr} AS ter_name,
        sum(s.total_quantity) AS trend_views
      FROM ${CLICKHOUSE_TABLES.TRENDS_TER_MONTHLY} s
      ${joinSql}
      WHERE 1=1
        AND s.period >= toDate({from:String})
        AND s.period <= toDate({to:String})
        ${whereTer}
        ${filterSql}
      GROUP BY period_date, period_str, ter_name
      ORDER BY period_date ASC, trend_views DESC
    `;

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
    const fromDate = normalizeDateToFirstOfMonth(query.fromDate);
    const toDate = normalizeDateToFirstOfMonth(query.toDate);
    const { joinSql, filterSql, params } = this.buildTenantFilters(tenantId, query);
    params.from = fromDate;
    params.to = toDate;

    // Truy vấn trên SALES_TER_MONTHLY để lấy cả tổng quantity, tổng USD, và số lượng territory (vùng)
    const sql = `
      SELECT
        sum(s.total_quantity)     AS total_quantity,
        sum(s.total_revenue_usd) AS total_revenue_usd,
        uniq(s.territory_code)   AS total_territories
      FROM ${CLICKHOUSE_TABLES.SALES_TER_MONTHLY} s
      ${joinSql}
      WHERE 1=1
        AND s.period >= toDate({from:String})
        AND s.period <= toDate({to:String})
        ${filterSql}
    `;
    const rows = await this.clickHouseService.query<{
      total_quantity: string;
      total_revenue_usd: string;
      total_territories: string;
    }>(sql, params);

    return {
      totalRevenueUsd: Number(rows[0]?.total_revenue_usd ?? 0),
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
    const fromDate = normalizeDateToFirstOfMonth(query.fromDate);
    const toDate = normalizeDateToFirstOfMonth(query.toDate);
    const { topN = 5, includeOther = true } = query;
    const { joinSql, filterSql, params } = this.buildTenantFilters(tenantId, query);
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
    const topDspsSql = `
      SELECT
        s.dsp_id AS dsp_id,
        ${resolvedDspName} AS dsp_name,
        sum(s.total_revenue_usd) AS revenue
      FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
      ${joinSql}
      ${joinExpr}
      WHERE 1=1
        AND s.period >= toDate({from:String})
        AND s.period <= toDate({to:String})
        ${filterSql}
      GROUP BY s.dsp_id, dsp_name
      ORDER BY revenue DESC
      LIMIT ${topN}
    `;
    const topDspsRows = await this.clickHouseService.query<{ dsp_id: string; dsp_name: string }>(
      topDspsSql,
      params,
    );
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

    const timelineSql = `
      SELECT
        toStartOfMonth(s.period) AS period_date,
        formatDateTime(s.period, '%Y-%m') AS period_str,
        ${dspExpr},
        sum(s.total_quantity) AS quantity,
        sum(s.total_revenue_usd) AS revenue_usd
      FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
      ${joinSql}
      ${joinExpr}
      WHERE 1=1
        AND s.period >= toDate({from:String})
        AND s.period <= toDate({to:String})
        ${whereDsp}
        ${filterSql}
      GROUP BY period_date, period_str, dsp_name
      ORDER BY period_date ASC, revenue_usd DESC
    `;

    const rows = await this.clickHouseService.query<{
      period_str: string;
      dsp_name: string;
      quantity: string;
      revenue_usd: string;
    }>(timelineSql, params);

    // Group kết quả: mỗi period có tổng + series DSP breakdown
    const periodMap = new Map<string, { revenueUsd: number; quantity: number; series: { dsp: string; revenueUsd: number; quantity: number }[] }>();
    for (const row of rows) {
      let period = periodMap.get(row.period_str);
      if (!period) {
        period = { revenueUsd: 0, quantity: 0, series: [] };
        periodMap.set(row.period_str, period);
      }
      const rev = Number(row.revenue_usd);
      const qty = Number(row.quantity);
      period.revenueUsd += rev;
      period.quantity += qty;
      period.series.push({
        dsp: row.dsp_name,
        revenueUsd: rev,
        quantity: qty,
      });
    }

    const items = Array.from(periodMap.entries()).map(([key, val]) => ({
      period: key,
      revenueUsd: val.revenueUsd,
      quantity: val.quantity,
      series: val.series,
    }));

    return { topDsps, items };
  }

  // ═══════════════════════════════════════════════════════
  // REVENUE TOP DSP (Top đối tác theo doanh thu)
  // ═══════════════════════════════════════════════════════
  async getRevenueTopDsp(
    tenantId: string,
    query: TimelineQueryDto,
  ): Promise<RevenueTopDspResponse> {
    const fromDate = normalizeDateToFirstOfMonth(query.fromDate);
    const toDate = normalizeDateToFirstOfMonth(query.toDate);
    const { topN = 5 } = query;
    const { joinSql, filterSql, params } = this.buildTenantFilters(tenantId, query);
    params.from = fromDate;
    params.to = toDate;

    // Coalesce: ưu tiên pg_dsps_sync, tiếp đến dsps_report, cuối cùng là dsp_id gốc
    const resolvedDspName = `coalesce(nullIf(p.dsp_name, ''), nullIf(r.dsp_name, ''), s.dsp_id)`;
    const joinExpr = `
      LEFT JOIN (SELECT * FROM music_analytics.dsps_report FINAL) r ON s.dsp_id = r.id_dsps_report
      LEFT JOIN (SELECT * FROM music_analytics.pg_dsps_sync FINAL) p ON r.pg_uuid = p.pg_uuid
    `;

    const sql = `
      SELECT
        ${resolvedDspName} AS dsp_name,
        sum(s.total_quantity) AS quantity,
        sum(s.total_revenue_usd) AS revenue_usd
      FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
      ${joinSql}
      ${joinExpr}
      WHERE 1=1
        AND s.period >= toDate({from:String})
        AND s.period <= toDate({to:String})
        ${filterSql}
      GROUP BY dsp_name
      ORDER BY revenue_usd DESC
      LIMIT ${topN}
    `;
    const rows = await this.clickHouseService.query<{
      dsp_name: string;
      quantity: string;
      revenue_usd: string;
    }>(sql, params);

    return rows.map((r) => ({
      dspName: r.dsp_name,
      revenueUsd: Number(r.revenue_usd),
      quantity: Number(r.quantity),
    }));
  }

  // ═══════════════════════════════════════════════════════
  // REVENUE TOP ARTIST (Top nghệ sĩ theo doanh thu)
  // Luôn JOIN pg_tracks_sync để lấy artist_ids.
  // System-tenant: không filter tenant_id → thấy tất cả.
  // ═══════════════════════════════════════════════════════
  async getRevenueTopArtist(
    tenantId: string,
    query: TimelineQueryDto,
  ): Promise<RevenueTopArtistResponse> {
    const fromDate = normalizeDateToFirstOfMonth(query.fromDate);
    const toDate = normalizeDateToFirstOfMonth(query.toDate);
    const { topN = 10 } = query;
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

    const sql = `
      SELECT
        arrayJoin(t.artist_ids) AS artistId,
        sum(s.total_revenue_usd) AS revenue_usd,
        sum(s.total_quantity) AS quantity,
        uniq(s.isrc) AS track_count
      FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
      INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc
      WHERE 1=1
        AND s.period >= toDate({from:String})
        AND s.period <= toDate({to:String})
        ${filterSql}
      GROUP BY artistId
      HAVING artistId != ''
      ORDER BY revenue_usd DESC
      LIMIT ${topN}
    `;

    const rows = await this.clickHouseService.query<{
      artistId: string;
      revenue_usd: string;
      quantity: string;
      track_count: string;
    }>(sql, params);

    if (!rows.length) return [];

    const artistIds = rows.map((r) => r.artistId);
    const artistMappings = await this.isrcResolverService.getAllIsrcArtistMappingsForTenant(tenantId);
    const artistMetaMap = new Map<string, { artistName: string; artistPicture: string | null }>();
    for (const a of artistMappings) {
      if (!artistMetaMap.has(a.artistId)) {
        artistMetaMap.set(a.artistId, { artistName: a.artistName, artistPicture: a.artistPicture });
      }
    }

    return rows.map((r, index) => {
      const meta = artistMetaMap.get(r.artistId);
      return {
        rank: index + 1,
        artistId: r.artistId,
        artistName: meta?.artistName ?? 'Unknown Artist',
        picture: meta?.artistPicture ?? null,
        trackCount: Number(r.track_count),
        revenueUsd: Number(r.revenue_usd),
        quantity: Number(r.quantity),
      };
    });
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
  ): Promise<RevenueTopTrackResponse> {
    const fromDate = normalizeDateToFirstOfMonth(query.fromDate);
    const toDate = normalizeDateToFirstOfMonth(query.toDate);
    const { topN = 10 } = query;
    const isSystem = checkIsSystemTenant(tenantId);

    const params: Record<string, any> = { from: fromDate, to: toDate };

    let joinSql = '';
    let filterSql = '';

    if (!isSystem) {
      // Normal tenant: phải JOIN để filter
      joinSql = `INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc`;
      filterSql = 'AND t.is_deleted = 0 AND t.tenant_id = {tenantId:String}';
      params.tenantId = tenantId;

      if (query.labelId) {
        filterSql += ' AND t.label_id = {labelId:String}';
        params.labelId = query.labelId;
      }
      if (query.releaseId) {
        filterSql += ' AND t.release_id = {releaseId:String}';
        params.releaseId = query.releaseId;
      }
    } else {
      // System-tenant: sub-filters vẫn có thể JOIN nếu có
      if (query.labelId || query.releaseId) {
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
      }
      // Không có sub-filter → không JOIN, query toàn bộ
    }

    const sql = `
      SELECT
        s.isrc AS isrc,
        sum(s.total_revenue_usd) AS revenue_usd,
        sum(s.total_quantity) AS quantity
      FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
      ${joinSql}
      WHERE 1=1
        AND s.period >= toDate({from:String})
        AND s.period <= toDate({to:String})
        ${filterSql}
      GROUP BY isrc
      ORDER BY revenue_usd DESC
      LIMIT ${topN}
    `;

    const rows = await this.clickHouseService.query<{
      isrc: string;
      revenue_usd: string;
      quantity: string;
    }>(sql, params);

    if (!rows.length) return [];

    const topIsrcs = rows.map((r) => r.isrc);

    // Enrich từ Postgres trước
    const [metadataMap, artistMappings] = await Promise.all([
      this.isrcResolverService.getTrackMetadataMap(topIsrcs),
      this.isrcResolverService.getIsrcArtistMappings(topIsrcs),
    ]);

    const artistNameMap = new Map<string, string>();
    for (const m of artistMappings) {
      const cur = artistNameMap.get(m.isrc);
      artistNameMap.set(m.isrc, cur ? `${cur}, ${m.artistName}` : m.artistName);
    }

    // Tìm ISRCs còn thiếu metadata (chỉ xảy ra với system-tenant)
    const missingIsrcs = isSystem
      ? topIsrcs.filter((isrc) => !metadataMap.has(isrc))
      : [];

    // Fallback: lấy track_title + artist_name từ fact_sales_report
    const fallbackMap = new Map<string, { trackTitle: string; artistName: string }>();
    if (missingIsrcs.length > 0) {
      const fbParams = { isrcs: missingIsrcs };
      const fbSql = `
        SELECT
          isrc,
          any(track_title) AS track_title,
          any(artist_name) AS artist_name
        FROM ${CLICKHOUSE_TABLES.FACT_SALES_REPORT}
        WHERE isrc IN ({isrcs:Array(String)})
        GROUP BY isrc
      `;
      const fbRows = await this.clickHouseService.query<{
        isrc: string;
        track_title: string;
        artist_name: string;
      }>(fbSql, fbParams);
      for (const fb of fbRows) {
        fallbackMap.set(fb.isrc, { trackTitle: fb.track_title, artistName: fb.artist_name });
      }
    }

    return rows.map((r, index): RevenueTrackItem => {
      const meta = metadataMap.get(r.isrc);
      const fallback = fallbackMap.get(r.isrc);
      return {
        rank: index + 1,
        isrc: r.isrc,
        title: meta?.trackTitle ?? fallback?.trackTitle ?? '',
        version: meta?.trackVersion ?? null,
        artistName: artistNameMap.get(r.isrc) ?? fallback?.artistName ?? '',
        releaseId: meta?.releaseId ?? null,
        releaseTitle: meta?.releaseTitle ?? null,
        revenueUsd: Number(r.revenue_usd),
        quantity: Number(r.quantity),
      };
    });
  }
}
