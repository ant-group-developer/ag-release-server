import { Injectable, Logger } from '@nestjs/common';
import { ClickHouseService } from 'src/modules/clickhouse/clickhouse.service';
import { CLICKHOUSE_TABLES } from 'src/modules/clickhouse/clickhouse.constants';
import { checkIsSystemTenant } from 'src/modules/user/utils/user-type.util';
import { TimelineQueryDto } from '../dto/analytics-query.dto';
import {
  DspTimelineResponse,
  DspTimelinePeriod,
  TerTimelineResponse,
  TerTimelinePeriod,
} from '../interfaces/analytics.interface';

@Injectable()
export class TimelineAnalyticsService {
  private readonly logger = new Logger(TimelineAnalyticsService.name);

  constructor(private readonly clickHouseService: ClickHouseService) {}

  // ═══════════════════════════════════════════════════════
  // Helper: Xay dung menh de WHERE cho phan quyen Tenant
  // ═══════════════════════════════════════════════════════
  private buildTenantFilters(
    tenantId: string,
    query: TimelineQueryDto,
  ): { filterSql: string; params: Record<string, any> } {
    const params: Record<string, any> = {};
    let filterSql = '';

    if (!checkIsSystemTenant(tenantId)) {
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

    return { filterSql, params };
  }

  // ═══════════════════════════════════════════════════════
  // DSP SALES TIMELINE (Có Doanh thu + Lượt nghe đối soát)
  // ═══════════════════════════════════════════════════════
  async getDspSalesTimeline(
    tenantId: string,
    query: TimelineQueryDto,
  ): Promise<DspTimelineResponse> {
    const { fromDate, toDate, topN = 5, includeOther = true } = query;
    const { filterSql, params } = this.buildTenantFilters(tenantId, query);
    params.from = fromDate;
    params.to = toDate;

    // 1. Tim Top N DSPs dua tren views cua tenant
    const topDspsSql = `
      SELECT
        s.dsp_id AS dsp_id,
        sum(s.total_quantity) AS views
      FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
      INNER JOIN ${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} t ON s.isrc = t.isrc
      WHERE t.is_deleted = 0
        AND s.period >= toDate({from:String})
        AND s.period <= toDate({to:String})
        ${filterSql}
      GROUP BY dsp_id
      ORDER BY views DESC
      LIMIT ${topN}
    `;
    const topDspsRows = await this.clickHouseService.query<{ dsp_id: string }>(
      topDspsSql,
      params,
    );
    const topDsps = topDspsRows.map((r) => r.dsp_id);

    if (!topDsps.length) {
      return { topDsps: [], items: [] };
    }

    // 2. Query monthly timeline native JOIN
    params.topDsps = topDsps;
    const dspExpr = includeOther
      ? `multiIf(s.dsp_id IN ({topDsps:Array(String)}), s.dsp_id, 'Other')`
      : 's.dsp_id';
    const whereDsp = includeOther
      ? ''
      : 'AND s.dsp_id IN ({topDsps:Array(String)})';

    const timelineSql = `
      SELECT
        toStartOfMonth(s.period) AS period_date,
        formatDateTime(s.period, '%Y-%m') AS period_str,
        ${dspExpr} AS dsp_name,
        sum(s.total_quantity) AS sales_views
      FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
      INNER JOIN ${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} t ON s.isrc = t.isrc
      WHERE t.is_deleted = 0
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
    const { fromDate, toDate, topN = 5, includeOther = true } = query;
    const { filterSql, params } = this.buildTenantFilters(tenantId, query);
    params.from = fromDate;
    params.to = toDate;

    // 1. Tim Top N DSPs trends
    const topDspsSql = `
      SELECT
        s.dsp_id AS dsp_id,
        sum(s.total_quantity) AS views
      FROM ${CLICKHOUSE_TABLES.TRENDS_DSP_MONTHLY} s
      INNER JOIN ${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} t ON s.isrc = t.isrc
      WHERE t.is_deleted = 0
        AND s.period >= toDate({from:String})
        AND s.period <= toDate({to:String})
        ${filterSql}
      GROUP BY dsp_id
      ORDER BY views DESC
      LIMIT ${topN}
    `;
    const topDspsRows = await this.clickHouseService.query<{ dsp_id: string }>(
      topDspsSql,
      params,
    );
    const topDsps = topDspsRows.map((r) => r.dsp_id);

    if (!topDsps.length) {
      return { topDsps: [], items: [] };
    }

    // 2. Query timeline
    params.topDsps = topDsps;
    const dspExpr = includeOther
      ? `multiIf(s.dsp_id IN ({topDsps:Array(String)}), s.dsp_id, 'Other')`
      : 's.dsp_id';
    const whereDsp = includeOther
      ? ''
      : 'AND s.dsp_id IN ({topDsps:Array(String)})';

    const timelineSql = `
      SELECT
        toStartOfMonth(s.period) AS period_date,
        formatDateTime(s.period, '%Y-%m') AS period_str,
        ${dspExpr} AS dsp_name,
        sum(s.total_quantity) AS trend_views
      FROM ${CLICKHOUSE_TABLES.TRENDS_DSP_MONTHLY} s
      INNER JOIN ${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} t ON s.isrc = t.isrc
      WHERE t.is_deleted = 0
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
  // TERRITORY SALES TIMELINE
  // ═══════════════════════════════════════════════════════
  async getTerSalesTimeline(
    tenantId: string,
    query: TimelineQueryDto,
  ): Promise<TerTimelineResponse> {
    const { fromDate, toDate, topN = 5, includeOther = true } = query;
    const { filterSql, params } = this.buildTenantFilters(tenantId, query);
    params.from = fromDate;
    params.to = toDate;

    // 1. Tim Top N Territories
    const topTersSql = `
      SELECT
        s.territory_code AS territory,
        sum(s.total_quantity) AS views
      FROM ${CLICKHOUSE_TABLES.SALES_TER_MONTHLY} s
      INNER JOIN ${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} t ON s.isrc = t.isrc
      WHERE t.is_deleted = 0
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
        sum(s.total_quantity) AS sales_views
      FROM ${CLICKHOUSE_TABLES.SALES_TER_MONTHLY} s
      INNER JOIN ${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} t ON s.isrc = t.isrc
      WHERE t.is_deleted = 0
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
    const { fromDate, toDate, topN = 5, includeOther = true } = query;
    const { filterSql, params } = this.buildTenantFilters(tenantId, query);
    params.from = fromDate;
    params.to = toDate;

    // 1. Tim Top N Territories
    const topTersSql = `
      SELECT
        s.territory_code AS territory,
        sum(s.total_quantity) AS views
      FROM ${CLICKHOUSE_TABLES.TRENDS_TER_MONTHLY} s
      INNER JOIN ${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} t ON s.isrc = t.isrc
      WHERE t.is_deleted = 0
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
      INNER JOIN ${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} t ON s.isrc = t.isrc
      WHERE t.is_deleted = 0
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
}
