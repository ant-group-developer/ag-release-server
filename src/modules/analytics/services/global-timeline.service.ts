import { Injectable, Logger } from '@nestjs/common';
import { ClickHouseService } from 'src/modules/clickhouse/clickhouse.service';
import { CLICKHOUSE_TABLES } from 'src/modules/clickhouse/clickhouse.constants';
import { checkIsSystemTenant } from 'src/modules/user/utils/user-type.util';
import { IsrcResolverService } from './isrc-resolver.service';
import { TimelineQueryDto, ChartQueryDto } from '../dto/analytics-query.dto';
import * as queries from '../queries/global-timeline.queries';
import { normalizeDateToFirstOfMonth } from 'src/utils/util.date';
import { PageDto } from 'src/common/dtos/common.response.dto';
import {
  DspTimelineResponse,
  DspTimelinePeriod,
  TerTimelineResponse,
  TerTimelinePeriod,
  RevenueOverviewResponse,
  RevenueTimelineResponse,
  RevenueTrackItem,
  RevenueDspItem,
  RevenueArtistItem,
  RevenueLabelItem,
  RevenueTenantItem,
  OverviewTrendsResponse,
  RevenueReleaseItem,
  TrendViewLineChartItem,
  DspBarChartItem,
  TerritoryBarChartItem,
  RevenueLineChartItem,
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
    query: { labelId?: string; releaseId?: string },
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
    const topDspsSql = queries.getDspSalesTimelineTopDspsQuery(
      joinSql,
      joinExpr,
      filterSql,
      resolvedDspName,
      topN,
    );
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
    const topDspsSql = queries.getDspTrendsTimelineTopDspsQuery(
      joinSql,
      joinExpr,
      filterSql,
      resolvedDspName,
      topN,
    );
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

    const timelineSql = queries.getDspTrendsTimelineQuery(
      joinSql,
      joinExpr,
      filterSql,
      dspExpr,
      whereDsp,
  )

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
    const topDspsSql = queries.getDspTrendsDailyTimelineTopDspsQuery(
      joinSql,
      joinExpr,
      filterSql,
      resolvedDspName,
      topN,
    );
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
    const fromDate = normalizeDateToFirstOfMonth(query.fromDate);
    const toDate = normalizeDateToFirstOfMonth(query.toDate);
    const { topN = 5, includeOther = true } = query;
    const { joinSql, filterSql, params } = this.buildTenantFilters(tenantId, query);
    params.from = fromDate;
    params.to = toDate;

    // 1. Tim Top N Territories
    const topTersSql = queries.getTerSalesTimelineTopTersQuery(joinSql, filterSql, topN);
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

    const timelineSql = queries.getTerSalesTimelineQuery(joinSql, filterSql, terExpr, whereTer);

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
    const topTersSql = queries.getTerTrendsTimelineTopTersQuery(joinSql, filterSql, topN);
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

    const timelineSql = queries.getTerTrendsTimelineQuery(joinSql, filterSql, terExpr, whereTer);

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
    const sql = queries.getRevenueOverviewQuery(joinSql, filterSql);
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
    const topDspsSql = queries.getRevenueTimelineTopDspsQuery(
      joinSql,
      joinExpr,
      filterSql,
      resolvedDspName,
      topN,
    );
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

  private getPaginationParams(query: TimelineQueryDto): { limit: number; offset: number; page: number; pageSize: number; isPaginated: boolean } {
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
    const fromDate = normalizeDateToFirstOfMonth(query.fromDate);
    const toDate = normalizeDateToFirstOfMonth(query.toDate);
    const { limit, offset, page, pageSize, isPaginated } = this.getPaginationParams(query);
    const { joinSql, filterSql: baseFilterSql, params } = this.buildTenantFilters(tenantId, query);
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
    const countSql = queries.getRevenueTopDspCountQuery(joinSql, joinExpr, filterSql, resolvedDspName);
    const countResult = await this.clickHouseService.query<{ total: string }>(countSql, params);
    const totalItems = Number(countResult[0]?.total ?? 0);

    // Data query
    const sql = queries.getRevenueTopDspQuery(joinSql, joinExpr, filterSql, resolvedDspName, limit, offset);
    const rows = await this.clickHouseService.query<{
      dsp_name: string;
      quantity: string;
      revenue_usd: string;
    }>(sql, params);

    const items: RevenueDspItem[] = rows.map((r) => ({
      dspName: r.dsp_name,
      revenueUsd: Number(r.revenue_usd),
      quantity: Number(r.quantity),
    }));

    const shouldIncludeOther = !isPaginated && query.includeOther === true;

    if (shouldIncludeOther && items.length > 0) {
      // Calculate total overall
      const totalSql = queries.getRevenueTopDspTotalQuery(joinSql, joinExpr, filterSql);
      const totalResult = await this.clickHouseService.query<{ total_qty: string; total_rev: string }>(totalSql, params);
      const totalQty = Number(totalResult[0]?.total_qty ?? 0);
      const totalRev = Number(totalResult[0]?.total_rev ?? 0);

      const itemsQtySum = items.reduce((acc, it) => acc + it.quantity, 0);
      const itemsRevSum = items.reduce((acc, it) => acc + it.revenueUsd, 0);

      const otherQty = totalQty - itemsQtySum;
      const otherRev = totalRev - itemsRevSum;

      if (otherQty > 0 || otherRev > 0) {
        items.push({
          dspName: 'Other',
          revenueUsd: otherRev > 0 ? otherRev : 0,
          quantity: otherQty > 0 ? otherQty : 0,
        });
      }
    }

    if (isPaginated) {
      return new PageDto({ items, metadata: { page, pageSize, totalItems } });
    } else {
      return new PageDto({ items, metadata: { page: 0, pageSize: 0, totalItems: 0 } });
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
    const fromDate = normalizeDateToFirstOfMonth(query.fromDate);
    const toDate = normalizeDateToFirstOfMonth(query.toDate);
    const { limit, offset, page, pageSize, isPaginated } = this.getPaginationParams(query);
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

    if (query.keyword) {
      let matchedArtistIds = await this.isrcResolverService.getArtistIdsByKeyword(query.keyword);
      if (matchedArtistIds.length === 0) {
        matchedArtistIds = ['__none__'];
      }
      params.matchedArtistIds = matchedArtistIds;
    }

    // Count query
    const countSql = queries.getRevenueTopArtistCountQuery(filterSql, !!query.keyword);
    const countResult = await this.clickHouseService.query<{ total: string }>(countSql, params);
    const totalItems = Number(countResult[0]?.total ?? 0);

    // Data query
    const sql = queries.getRevenueTopArtistQuery(filterSql, !!query.keyword, limit, offset);

    const rows = await this.clickHouseService.query<{
      artistId: string;
      revenue_usd: string;
      quantity: string;
      track_count: string;
    }>(sql, params);

    const items: RevenueArtistItem[] = [];

    if (rows.length > 0) {
      const artistIds = rows.map((r) => r.artistId);
      const artistMappings = await this.isrcResolverService.getAllIsrcArtistMappingsForTenant(tenantId);
      const artistMetaMap = new Map<string, { artistName: string; artistPicture: string | null }>();
      for (const a of artistMappings) {
        if (!artistMetaMap.has(a.artistId)) {
          artistMetaMap.set(a.artistId, { artistName: a.artistName, artistPicture: a.artistPicture });
        }
      }

      rows.forEach((r, index) => {
        const meta = artistMetaMap.get(r.artistId);
        items.push({
          rank: offset + index + 1,
          artistId: r.artistId,
          artistName: meta?.artistName ?? 'Unknown Artist',
          picture: meta?.artistPicture ?? null,
          trackCount: Number(r.track_count),
          revenueUsd: Number(r.revenue_usd),
          quantity: Number(r.quantity),
        });
      });

      const shouldIncludeOther = !isPaginated && query.includeOther === true;

      if (shouldIncludeOther) {
        // Calculate total overall from joined tracks table
        const totalSql = queries.getRevenueTopArtistTotalQuery(filterSql, !!query.keyword);
        const totalResult = await this.clickHouseService.query<{ total_qty: string; total_rev: string }>(totalSql, params);
        const totalQty = Number(totalResult[0]?.total_qty ?? 0);
        const totalRev = Number(totalResult[0]?.total_rev ?? 0);

        const itemsQtySum = items.reduce((acc, it) => acc + it.quantity, 0);
        const itemsRevSum = items.reduce((acc, it) => acc + it.revenueUsd, 0);

        const otherQty = totalQty - itemsQtySum;
        const otherRev = totalRev - itemsRevSum;

        if (otherQty > 0 || otherRev > 0) {
          items.push({
            rank: items.length + 1,
            artistId: 'other',
            artistName: 'Other',
            picture: null,
            trackCount: 0,
            revenueUsd: otherRev > 0 ? otherRev : 0,
            quantity: otherQty > 0 ? otherQty : 0,
          });
        }
      }
    }

    if (isPaginated) {
      return new PageDto({ items, metadata: { page, pageSize, totalItems } });
    } else {
      return new PageDto({ items, metadata: { page: 0, pageSize: 0, totalItems: 0 } });
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
    const fromDate = normalizeDateToFirstOfMonth(query.fromDate);
    const toDate = normalizeDateToFirstOfMonth(query.toDate);
    const { limit, offset, page, pageSize, isPaginated } = this.getPaginationParams(query);
    const isSystem = checkIsSystemTenant(tenantId);

    const params: Record<string, any> = { from: fromDate, to: toDate };

    let joinSql = '';
    let filterSql = '';

    if (!isSystem) {
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
    }

    if (query.keyword) {
      let matchedIsrcs = await this.isrcResolverService.getIsrcsByTrackTitleKeyword(query.keyword);
      if (matchedIsrcs.length === 0) {
        matchedIsrcs = ['__none__'];
      }
      filterSql += ' AND s.isrc IN ({matchedIsrcs:Array(String)})';
      params.matchedIsrcs = matchedIsrcs;
    }

    // Count query
    const countSql = queries.getRevenueTopTrackCountQuery(joinSql, filterSql);
    const countResult = await this.clickHouseService.query<{ total: string }>(countSql, params);
    const totalItems = Number(countResult[0]?.total ?? 0);

    // Data query
    const sql = queries.getRevenueTopTrackQuery(joinSql, filterSql, limit, offset);

    const rows = await this.clickHouseService.query<{
      isrc: string;
      revenue_usd: string;
      quantity: string;
    }>(sql, params);

    const items: RevenueTrackItem[] = [];

    if (rows.length > 0) {
      const topIsrcs = rows.map((r) => r.isrc);

      const [metadataMap, artistMappings] = await Promise.all([
        this.isrcResolverService.getTrackMetadataMap(topIsrcs),
        this.isrcResolverService.getIsrcArtistMappings(topIsrcs),
      ]);

      const artistNameMap = new Map<string, string>();
      for (const m of artistMappings) {
        const cur = artistNameMap.get(m.isrc);
        artistNameMap.set(m.isrc, cur ? `${cur}, ${m.artistName}` : m.artistName);
      }

      const missingIsrcs = isSystem
        ? topIsrcs.filter((isrc) => !metadataMap.has(isrc))
        : [];

      const fallbackMap = new Map<string, { trackTitle: string; artistName: string }>();
      if (missingIsrcs.length > 0) {
        const fbParams = { isrcs: missingIsrcs };
        const fbSql = queries.getRevenueTopTrackFallbackQuery();
        const fbRows = await this.clickHouseService.query<{
          isrc: string;
          track_title: string;
          artist_name: string;
        }>(fbSql, fbParams);
        for (const fb of fbRows) {
          fallbackMap.set(fb.isrc, { trackTitle: fb.track_title, artistName: fb.artist_name });
        }
      }

      rows.forEach((r, index) => {
        const meta = metadataMap.get(r.isrc);
        const fallback = fallbackMap.get(r.isrc);
        items.push({
          rank: offset + index + 1,
          isrc: r.isrc,
          title: meta?.trackTitle ?? fallback?.trackTitle ?? '',
          version: meta?.trackVersion ?? null,
          artistName: artistNameMap.get(r.isrc) ?? fallback?.artistName ?? '',
          releaseId: meta?.releaseId ?? null,
          releaseTitle: meta?.releaseTitle ?? null,
          revenueUsd: Number(r.revenue_usd),
          quantity: Number(r.quantity),
        });
      });

      const shouldIncludeOther = !isPaginated && query.includeOther === true;

      if (shouldIncludeOther) {
        const totalSql = queries.getRevenueTopTrackTotalQuery(joinSql, filterSql);
        const totalResult = await this.clickHouseService.query<{ total_qty: string; total_rev: string }>(totalSql, params);
        const totalQty = Number(totalResult[0]?.total_qty ?? 0);
        const totalRev = Number(totalResult[0]?.total_rev ?? 0);

        const itemsQtySum = items.reduce((acc, it) => acc + it.quantity, 0);
        const itemsRevSum = items.reduce((acc, it) => acc + it.revenueUsd, 0);

        const otherQty = totalQty - itemsQtySum;
        const otherRev = totalRev - itemsRevSum;

        if (otherQty > 0 || otherRev > 0) {
          items.push({
            rank: items.length + 1,
            isrc: 'other',
            title: 'Other',
            version: null,
            artistName: '',
            releaseId: null,
            releaseTitle: null,
            revenueUsd: otherRev > 0 ? otherRev : 0,
            quantity: otherQty > 0 ? otherQty : 0,
          });
        }
      }
    }

    if (isPaginated) {
      return new PageDto({ items, metadata: { page, pageSize, totalItems } });
    } else {
      return new PageDto({ items, metadata: { page: 0, pageSize: 0, totalItems: 0 } });
    }
  }

  // ═══════════════════════════════════════════════════════
  // REVENUE TOP LABEL (Top label theo doanh thu)
  // ═══════════════════════════════════════════════════════
  async getRevenueTopLabel(
    tenantId: string,
    query: TimelineQueryDto,
  ): Promise<PageDto<RevenueLabelItem>> {
    const fromDate = normalizeDateToFirstOfMonth(query.fromDate);
    const toDate = normalizeDateToFirstOfMonth(query.toDate);
    const { limit, offset, page, pageSize, isPaginated } = this.getPaginationParams(query);
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

    if (query.keyword) {
      let matchedLabelIds = await this.isrcResolverService.getLabelIdsByKeyword(query.keyword);
      if (matchedLabelIds.length === 0) {
        matchedLabelIds = ['__none__'];
      }
      filterSql += ' AND t.label_id IN ({matchedLabelIds:Array(String)})';
      params.matchedLabelIds = matchedLabelIds;
    }

    const joinSql = `INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc`;

    // Count query
    const countSql = queries.getRevenueTopLabelCountQuery(joinSql, filterSql);
    const countResult = await this.clickHouseService.query<{ total: string }>(countSql, params);
    const totalItems = Number(countResult[0]?.total ?? 0);

    // Data query
    const sql = queries.getRevenueTopLabelQuery(joinSql, filterSql, limit, offset);
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
      const labelsMeta = await this.isrcResolverService.getLabelMetadata(labelIds);

      rows.forEach((r, index) => {
        const meta = labelsMeta.get(r.labelId);
        items.push({
          rank: offset + index + 1,
          labelId: r.labelId,
          labelName: meta?.name ?? 'Unknown Label',
          picture: meta?.picture ?? null,
          releaseCount: Number(r.release_count),
          trackCount: Number(r.track_count),
          revenueUsd: Number(r.revenue_usd),
          quantity: Number(r.quantity),
        });
      });

      const shouldIncludeOther = !isPaginated && query.includeOther === true;

      if (shouldIncludeOther) {
        const totalSql = queries.getRevenueTopLabelTotalQuery(joinSql, filterSql);
        const totalResult = await this.clickHouseService.query<{ total_qty: string; total_rev: string }>(totalSql, params);
        const totalQty = Number(totalResult[0]?.total_qty ?? 0);
        const totalRev = Number(totalResult[0]?.total_rev ?? 0);

        const itemsQtySum = items.reduce((acc, it) => acc + it.quantity, 0);
        const itemsRevSum = items.reduce((acc, it) => acc + it.revenueUsd, 0);

        const otherQty = totalQty - itemsQtySum;
        const otherRev = totalRev - itemsRevSum;

        if (otherQty > 0 || otherRev > 0) {
          items.push({
            rank: items.length + 1,
            labelId: 'other',
            labelName: 'Other',
            picture: null,
            revenueUsd: otherRev > 0 ? otherRev : 0,
            quantity: otherQty > 0 ? otherQty : 0,
          });
        }
      }
    }

    if (isPaginated) {
      return new PageDto({ items, metadata: { page, pageSize, totalItems } });
    } else {
      return new PageDto({ items, metadata: { page: 0, pageSize: 0, totalItems: 0 } });
    }
  }

  // ═══════════════════════════════════════════════════════
  // REVENUE TOP TENANT (Top tenant theo doanh thu)
  // ═══════════════════════════════════════════════════════
  async getRevenueTopTenant(
    tenantId: string,
    query: TimelineQueryDto,
  ): Promise<PageDto<RevenueTenantItem>> {
    const fromDate = normalizeDateToFirstOfMonth(query.fromDate);
    const toDate = normalizeDateToFirstOfMonth(query.toDate);
    const { limit, offset, page, pageSize, isPaginated } = this.getPaginationParams(query);
    const isSystem = checkIsSystemTenant(tenantId);

    const params: Record<string, any> = { from: fromDate, to: toDate };
    let filterSql = 'AND t.is_deleted = 0';

    if (!isSystem) {
      filterSql += ' AND t.tenant_id = {tenantId:String}';
      params.tenantId = tenantId;
    }

    if (query.keyword) {
      let matchedTenantIds = await this.isrcResolverService.getTenantIdsByKeyword(query.keyword);
      if (matchedTenantIds.length === 0) {
        matchedTenantIds = ['__none__'];
      }
      filterSql += ' AND t.tenant_id IN ({matchedTenantIds:Array(String)})';
      params.matchedTenantIds = matchedTenantIds;
    }

    const joinSql = `INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc`;

    // Count query
    const countSql = queries.getRevenueTopTenantCountQuery(joinSql, filterSql);
    const countResult = await this.clickHouseService.query<{ total: string }>(countSql, params);
    const totalItems = Number(countResult[0]?.total ?? 0);

    // Data query
    const sql = queries.getRevenueTopTenantQuery(joinSql, filterSql, limit, offset);
    const rows = await this.clickHouseService.query<{
      tenantId: string;
      revenue_usd: string;
      quantity: string;
    }>(sql, params);

    const items: RevenueTenantItem[] = [];

    if (rows.length > 0) {
      const tenantIds = rows.map((r) => r.tenantId);
      const tenantMetaMap = await this.isrcResolverService.getTenantMetadata(tenantIds);

      rows.forEach((r, index) => {
        const meta = tenantMetaMap.get(r.tenantId);
        items.push({
          rank: offset + index + 1,
          tenantId: r.tenantId,
          tenantName: meta?.title ?? 'Unknown Tenant',
          logo: meta?.logo ?? null,
          revenueUsd: Number(r.revenue_usd),
          quantity: Number(r.quantity),
        });
      });

      const shouldIncludeOther = !isPaginated && query.includeOther === true;

      if (shouldIncludeOther) {
        const totalSql = queries.getRevenueTopTenantTotalQuery(joinSql, filterSql);
        const totalResult = await this.clickHouseService.query<{ total_qty: string; total_rev: string }>(totalSql, params);
        const totalQty = Number(totalResult[0]?.total_qty ?? 0);
        const totalRev = Number(totalResult[0]?.total_rev ?? 0);

        const itemsQtySum = items.reduce((acc, it) => acc + it.quantity, 0);
        const itemsRevSum = items.reduce((acc, it) => acc + it.revenueUsd, 0);

        const otherQty = totalQty - itemsQtySum;
        const otherRev = totalRev - itemsRevSum;

        if (otherQty > 0 || otherRev > 0) {
          items.push({
            rank: items.length + 1,
            tenantId: 'other',
            tenantName: 'Other',
            logo: null,
            revenueUsd: otherRev > 0 ? otherRev : 0,
            quantity: otherQty > 0 ? otherQty : 0,
          });
        }
      }
    }

    if (isPaginated) {
      return new PageDto({ items, metadata: { page, pageSize, totalItems } });
    } else {
      return new PageDto({ items, metadata: { page: 0, pageSize: 0, totalItems: 0 } });
    }
  }

  // ═══════════════════════════════════════════════════════
  // TRENDS OVERVIEW (Tổng quan xu hướng trends)
  // ═══════════════════════════════════════════════════════
  async getTrendsOverview(
    tenantId: string,
    query: TimelineQueryDto,
  ): Promise<OverviewTrendsResponse> {
    const isSystem = checkIsSystemTenant(tenantId);
    const params: Record<string, any> = { from: query.fromDate, to: query.toDate };

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

    // Query 1: views, dsps, tracks, labels
    const mainSql = queries.getTrendsOverviewMainQuery(joinSql, filterSql);

    const mainResult = await this.clickHouseService.query<{
      total_views: string;
      total_dsps: string;
      total_tracks: string;
      total_labels: string;
    }>(mainSql, params);

    // Query 2: artist count using subquery to handle arrayJoin safely
    const artistSql = queries.getTrendsOverviewArtistQuery(joinSql, filterSql);
    const artistResult = await this.clickHouseService.query<{ total_artists: string }>(artistSql, params);

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
    const fromDate = normalizeDateToFirstOfMonth(query.fromDate);
    const toDate = normalizeDateToFirstOfMonth(query.toDate);
    const { limit, offset, page, pageSize, isPaginated } = this.getPaginationParams(query);
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

    if (query.keyword) {
      let matchedReleaseIds = await this.isrcResolverService.getReleaseIdsByKeyword(query.keyword);
      if (matchedReleaseIds.length === 0) {
        matchedReleaseIds = ['__none__'];
      }
      filterSql += ' AND t.release_id IN ({matchedReleaseIds:Array(String)})';
      params.matchedReleaseIds = matchedReleaseIds;
    }

    // Count query
    const countSql = queries.getRevenueTopReleaseCountQuery(filterSql);
    const countResult = await this.clickHouseService.query<{ total: string }>(countSql, params);
    const totalItems = Number(countResult[0]?.total ?? 0);

    // Data query
    const sql = queries.getRevenueTopReleaseQuery(filterSql, limit, offset);
    const rows = await this.clickHouseService.query<{
      releaseId: string;
      revenue_usd: string;
      quantity: string;
    }>(sql, params);

    const items: RevenueReleaseItem[] = [];

    if (rows.length > 0) {
      const releaseIds = rows.map((r) => r.releaseId);
      const releasesMeta = await this.isrcResolverService.getReleaseMetadata(releaseIds);

      rows.forEach((r, index) => {
        const meta = releasesMeta.get(r.releaseId);
        items.push({
          rank: offset + index + 1,
          releaseId: r.releaseId,
          title: meta?.title ?? 'Unknown Release',
          upc: meta?.upc ?? null,
          labelId: meta?.labelId ?? null,
          labelName: meta?.labelName ?? null,
          trackCount: meta?.trackCount ?? 0,
          revenueUsd: Number(r.revenue_usd),
          quantity: Number(r.quantity),
          release: meta ? { coverArtThumbnails: meta.coverArtThumbnails } : null,
        });
      });

      const shouldIncludeOther = !isPaginated && query.includeOther === true;

      if (shouldIncludeOther) {
        const totalSql = queries.getRevenueTopReleaseTotalQuery(filterSql);
        const totalResult = await this.clickHouseService.query<{ total_qty: string; total_rev: string }>(totalSql, params);
        const totalQty = Number(totalResult[0]?.total_qty ?? 0);
        const totalRev = Number(totalResult[0]?.total_rev ?? 0);

        const itemsQtySum = items.reduce((acc, it) => acc + it.quantity, 0);
        const itemsRevSum = items.reduce((acc, it) => acc + it.revenueUsd, 0);

        const otherQty = totalQty - itemsQtySum;
        const otherRev = totalRev - itemsRevSum;

        if (otherQty > 0 || otherRev > 0) {
          items.push({
            rank: items.length + 1,
            releaseId: 'other',
            title: 'Other',
            upc: null,
            labelId: null,
            labelName: null,
            trackCount: 0,
            revenueUsd: otherRev > 0 ? otherRev : 0,
            quantity: otherQty > 0 ? otherQty : 0,
            release: null,
          });
        }
      }
    }

    if (isPaginated) {
      return new PageDto({ items, metadata: { page, pageSize, totalItems } });
    } else {
      return new PageDto({ items, metadata: { page: 0, pageSize: 0, totalItems: 0 } });
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
    const isSystem = checkIsSystemTenant(tenantId);
    const params: Record<string, any> = { from: query.fromDate, to: query.toDate };

    let joinSql = '';
    let filterSql = '';
    const hasSubFilter = !!(query.labelId || query.releaseId);

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
    const isSystem = checkIsSystemTenant(tenantId);
    const params: Record<string, any> = { from: query.fromDate, to: query.toDate };

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

    const resolvedDspName = `coalesce(nullIf(p.dsp_name, ''), nullIf(r.dsp_name, ''), s.dsp_id)`;
    const joinExpr = `
      LEFT JOIN (SELECT * FROM music_analytics.dsps_report FINAL) r ON s.dsp_id = r.id_dsps_report
      LEFT JOIN (SELECT * FROM music_analytics.pg_dsps_sync FINAL) p ON r.pg_uuid = p.pg_uuid
    `;

    // Step 1: Get total views across all DSPs
    const totalSql = queries.getTrendViewDspBarChartTotalQuery(filterSql);
    const totalResult = await this.clickHouseService.query<{ total_views: string }>(totalSql, params);
    const grandTotal = Number(totalResult[0]?.total_views ?? 0);

    // Step 2: Get top 5 DSPs
    const sql = queries.getTrendViewDspBarChartQuery(filterSql, resolvedDspName, joinExpr);
    const rows = await this.clickHouseService.query<{
      dsp_name: string;
      total_views: string;
    }>(sql, params);

    const items: DspBarChartItem[] = rows.map((r) => ({
      dspName: r.dsp_name,
      totalViews: Number(r.total_views),
    }));

    // Step 3: Calculate Other
    const top5Total = items.reduce((acc, it) => acc + (it.totalViews ?? 0), 0);
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
    const fromDate = normalizeDateToFirstOfMonth(query.fromDate);
    const toDate = normalizeDateToFirstOfMonth(query.toDate);
    const { joinSql, filterSql, params } = this.buildTenantFilters(tenantId, query);
    params.from = fromDate;
    params.to = toDate;

    const totalSql = queries.getTrendViewTerritoryBarChartTotalQuery(joinSql, filterSql);
    const totalResult = await this.clickHouseService.query<{ total_views: string }>(totalSql, params);
    const grandTotal = Number(totalResult[0]?.total_views ?? 0);

    const sql = queries.getTrendViewTerritoryBarChartQuery(joinSql, filterSql);
    const rows = await this.clickHouseService.query<{
      territory: string;
      total_views: string;
    }>(sql, params);

    const items: TerritoryBarChartItem[] = rows.map((r) => ({
      territory: r.territory,
      totalViews: Number(r.total_views),
    }));

    const top5Total = items.reduce((acc, it) => acc + (it.totalViews ?? 0), 0);
    const otherViews = grandTotal - top5Total;
    if (otherViews > 0) {
      items.push({ territory: 'Other', totalViews: otherViews });
    }

    return items;
  }

  async getRevenueLineChart(
    tenantId: string,
    query: ChartQueryDto,
  ): Promise<RevenueLineChartItem[]> {
    const fromDate = normalizeDateToFirstOfMonth(query.fromDate);
    const toDate = normalizeDateToFirstOfMonth(query.toDate);
    const isSystem = checkIsSystemTenant(tenantId);
    const params: Record<string, any> = { from: fromDate, to: toDate };

    let joinSql = '';
    let filterSql = '';
    const hasSubFilter = !!(query.labelId || query.releaseId);

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
    }

    const sql = queries.getRevenueLineChartQuery(joinSql, filterSql);

    const rows = await this.clickHouseService.query<{
      period: string;
      revenue_usd: string;
      quantity: string;
    }>(sql, params);

    return rows.map((r) => ({
      period: r.period,
      revenueUsd: Number(r.revenue_usd),
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
    const fromDate = normalizeDateToFirstOfMonth(query.fromDate);
    const toDate = normalizeDateToFirstOfMonth(query.toDate);
    const isSystem = checkIsSystemTenant(tenantId);
    const params: Record<string, any> = { from: fromDate, to: toDate };

    let joinSql = '';
    let filterSql = '';
    const hasSubFilter = !!(query.labelId || query.releaseId);

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
    }

    const resolvedDspName = `coalesce(nullIf(p.dsp_name, ''), nullIf(r.dsp_name, ''), s.dsp_id)`;
    const joinExpr = `
      LEFT JOIN (SELECT * FROM music_analytics.dsps_report FINAL) r ON s.dsp_id = r.id_dsps_report
      LEFT JOIN (SELECT * FROM music_analytics.pg_dsps_sync FINAL) p ON r.pg_uuid = p.pg_uuid
    `;

    // Step 1: Get total revenue across all DSPs
    const totalSql = queries.getRevenueDspBarChartTotalQuery(joinSql, filterSql);
    const totalResult = await this.clickHouseService.query<{ total_rev: string }>(totalSql, params);
    const grandTotal = Number(totalResult[0]?.total_rev ?? 0);

    // Step 2: Get top 5 DSPs by revenue
    const sql = queries.getRevenueDspBarChartQuery(joinSql, joinExpr, filterSql, resolvedDspName);
    const rows = await this.clickHouseService.query<{
      dsp_name: string;
      revenue_usd: string;
    }>(sql, params);

    const items: DspBarChartItem[] = rows.map((r) => ({
      dspName: r.dsp_name,
      totalViews: undefined, // ensure matching expected type
      revenueUsd: Number(r.revenue_usd),
    }));

    // Step 3: Calculate Other
    const top5Total = items.reduce((acc, it) => acc + (it.revenueUsd ?? 0), 0);
    const otherRev = grandTotal - top5Total;
    if (otherRev > 0) {
      items.push({ dspName: 'Other', revenueUsd: otherRev });
    }

    return items;
  }

  async getRevenueTerritoryBarChart(
    tenantId: string,
    query: ChartQueryDto,
  ): Promise<TerritoryBarChartItem[]> {
    const fromDate = normalizeDateToFirstOfMonth(query.fromDate);
    const toDate = normalizeDateToFirstOfMonth(query.toDate);
    const { joinSql, filterSql, params } = this.buildTenantFilters(tenantId, query);
    params.from = fromDate;
    params.to = toDate;

    const totalSql = queries.getRevenueTerritoryBarChartTotalQuery(joinSql, filterSql);
    const totalResult = await this.clickHouseService.query<{ total_rev: string }>(totalSql, params);
    const grandTotal = Number(totalResult[0]?.total_rev ?? 0);

    const sql = queries.getRevenueTerritoryBarChartQuery(joinSql, filterSql);
    const rows = await this.clickHouseService.query<{
      territory: string;
      revenue_usd: string;
    }>(sql, params);

    const items: TerritoryBarChartItem[] = rows.map((r) => ({
      territory: r.territory,
      revenueUsd: Number(r.revenue_usd),
    }));

    const top5Total = items.reduce((acc, it) => acc + (it.revenueUsd ?? 0), 0);
    const otherRev = grandTotal - top5Total;
    if (otherRev > 0) {
      items.push({ territory: 'Other', revenueUsd: otherRev });
    }

    return items;
  }
}
