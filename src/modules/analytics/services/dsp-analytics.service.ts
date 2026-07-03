import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { ClickHouseService } from 'src/modules/clickhouse/clickhouse.service';
import { CLICKHOUSE_TABLES } from 'src/modules/clickhouse/clickhouse.constants';
import { checkIsSystemTenant } from 'src/modules/user/utils/user-type.util';
import { normalizeDateToFirstOfMonth } from 'src/utils/util.date';
import { EntityManager } from 'typeorm';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import {
  DspChartQueryDto,
  DspOverviewQueryDto,
} from '../dto/analytics-query.dto';
import { AnalyticsCacheService } from './analytics-cache.service';
import {
  DspMeta,
  DspOverviewResponse,
  RevenueLineChartItem,
  TerritoryBarChartItem,
  TrendViewLineChartItem,
} from '../interfaces/analytics.interface';

/**
 * DspAnalyticsService — thống kê chi tiết cho 1 DSP cụ thể.
 * Mirror pattern của EntityAnalyticsService nhưng với entity = DSP.
 *
 * Filter chiến lược:
 *  - Nhận pgDspId (Postgres UUID) và/hoặc dspReportId (raw ClickHouse ID)
 *  - Nếu có pgDspId → resolve qua dsps_report.pg_uuid để lấy TẤT CẢ raw dsp_id đã map
 *  - Nếu có dspReportId → filter thẳng s.dsp_id
 *  - Có cả 2 → OR (bảo đảm cover hết data, kể cả những raw ID chưa được map vào Postgres)
 */
@Injectable()
export class DspAnalyticsService {
  constructor(
    private readonly clickHouseService: ClickHouseService,
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
    const scale = Math.max(0, ...decimals.map((v) => (v.split('.')[1] || '').length));
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

  private subtractRevenueExact(left?: string | null, right?: string | null): string {
    const rightValue = this.revenueExact(right);
    return this.addRevenueExact([
      left,
      rightValue.startsWith('-') ? rightValue.slice(1) : `-${rightValue}`,
    ]);
  }

  // ─────────────────────────────────────────────────────
  // Helper: build JOIN + WHERE scoped theo DSP + tenant
  // ─────────────────────────────────────────────────────
  private buildDspFilters(
    tenantId: string,
    pgDspId?: string,
    dspReportId?: string,
    releaseType?: 'audio' | 'video',
  ): {
    joinSql: string;
    filterSql: string;
    params: Record<string, any>;
  } {
    if (!pgDspId && !dspReportId) {
      throw new BadRequestException(
        'Cần cung cấp ít nhất pgDspId hoặc dspReportId',
      );
    }

    const isSystem = checkIsSystemTenant(tenantId);
    const params: Record<string, any> = {};

    // DSP filter clause
    const dspClauses: string[] = [];
    if (pgDspId) {
      dspClauses.push(
        `s.dsp_id IN (SELECT id_dsps_report FROM music_analytics.${CLICKHOUSE_TABLES.DSPS_REPORT} FINAL WHERE pg_uuid = {pgDspId:String})`,
      );
      params.pgDspId = pgDspId;
    }
    if (dspReportId) {
      dspClauses.push(`s.dsp_id = {dspReportId:String}`);
      params.dspReportId = dspReportId;
    }
    const dspFilter = ` AND (${dspClauses.join(' OR ')})`;

    // Cần JOIN pg_tracks_sync để filter tenant (trừ system tenant + không có releaseType)
    if (isSystem && !releaseType) {
      return {
        joinSql: '',
        filterSql: dspFilter,
        params,
      };
    }

    const joinSql = `INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc`;
    let filterSql = ' AND t.is_deleted = 0';
    if (!isSystem) {
      filterSql += ' AND t.tenant_id = {tenantId:String}';
      params.tenantId = tenantId;
    }
    if (releaseType) {
      filterSql += ' AND t.release_type = {releaseType:String}';
      params.releaseType = releaseType;
    }
    filterSql += dspFilter;

    return { joinSql, filterSql, params };
  }

  // Map iso2 codes → country names (dùng cho territory bar chart)
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
    const countries = (await this.entityManager.query(
      `SELECT UPPER(iso2) AS iso2, name FROM countries WHERE UPPER(iso2) = ANY($1)`,
      [iso2Codes],
    )) as Array<{ iso2: string; name: string }>;
    const nameByIso2 = new Map(countries.map((c) => [c.iso2, c.name]));
    return items.map((item) => {
      const iso2 = item.territory?.trim().toUpperCase();
      return {
        ...item,
        territory:
          iso2 && iso2 !== 'OTHER'
            ? nameByIso2.get(iso2) ?? item.territory
            : item.territory,
      };
    });
  }

  // Lookup DSP metadata từ Postgres nếu có pgDspId
  private async loadDspMeta(
    pgDspId?: string,
    dspReportId?: string,
  ): Promise<DspMeta | null> {
    if (pgDspId) {
      const dsp = await this.entityManager.findOne(Dsp, {
        where: { id: pgDspId },
        select: ['id', 'name', 'code', 'picture', 'isActive', 'type'],
      });
      if (dsp) {
        const domain = process.env.R2_PUBLIC_BASE_URL || 'default.com';
        const pictureUrl = dsp.picture
          ? dsp.picture.startsWith('http')
            ? dsp.picture
            : `${domain}/${dsp.picture}`
          : null;
        return {
          pgDspId: dsp.id,
          dspReportId: dspReportId ?? null,
          name: dsp.name,
          code: dsp.code ?? null,
          picture: pictureUrl,
          isActive: dsp.isActive,
          type: dsp.type ?? null,
        };
      }
    }

    // Fallback: lookup name từ dsps_report ClickHouse
    if (dspReportId) {
      const rows = await this.clickHouseService.query<{
        dsp_name: string;
        pg_uuid: string;
      }>(
        `SELECT dsp_name, pg_uuid FROM music_analytics.${CLICKHOUSE_TABLES.DSPS_REPORT} FINAL WHERE id_dsps_report = {dspReportId:String} LIMIT 1`,
        { dspReportId },
      );
      if (rows.length) {
        return {
          pgDspId: rows[0].pg_uuid || null,
          dspReportId,
          name: rows[0].dsp_name || dspReportId,
          code: null,
          picture: null,
          isActive: null,
          type: null,
        };
      }
    }

    return null;
  }

  // ─────────────────────────────────────────────────────
  // OVERVIEW (tổng trend views + sales views + revenue + meta)
  // ─────────────────────────────────────────────────────
  async getOverview(
    dto: DspOverviewQueryDto,
    tenantId: string,
  ): Promise<DspOverviewResponse> {
    const key = this.cache.buildKey('dsp:overview', tenantId, dto);
    return this.cache.wrap(key, () => this.computeOverview(dto, tenantId));
  }

  private async computeOverview(
    dto: DspOverviewQueryDto,
    tenantId: string,
  ): Promise<DspOverviewResponse> {
    const fromDate = normalizeDateToFirstOfMonth(dto.fromDate);
    const toDate = normalizeDateToFirstOfMonth(dto.toDate);
    const { joinSql, filterSql, params } = this.buildDspFilters(
      tenantId,
      dto.pgDspId,
      dto.dspReportId,
      dto.releaseType,
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

    const [trendRows, salesRows, dspMeta] = await Promise.all([
      this.clickHouseService.query<{ total_trend_views: string }>(trendSql, params),
      this.clickHouseService.query<{
        total_sales_views: string;
        total_revenue_usd: string;
      }>(salesSql, params),
      this.loadDspMeta(dto.pgDspId, dto.dspReportId),
    ]);

    return {
      totalTrendViews: Number(trendRows[0]?.total_trend_views ?? 0),
      totalSalesViews: Number(salesRows[0]?.total_sales_views ?? 0),
      totalRevenueUsd: this.revenueNumber(salesRows[0]?.total_revenue_usd),
      totalRevenueUsdExact: this.revenueExact(salesRows[0]?.total_revenue_usd),
      dsp: dspMeta,
    };
  }

  // ─────────────────────────────────────────────────────
  // TREND VIEW LINE CHART (monthly)
  // ─────────────────────────────────────────────────────
  async getTrendViewLineChart(
    dto: DspChartQueryDto,
    tenantId: string,
  ): Promise<TrendViewLineChartItem[]> {
    const key = this.cache.buildKey('dsp:trend-line-chart', tenantId, dto);
    return this.cache.wrap(key, () =>
      this.computeTrendViewLineChart(dto, tenantId),
    );
  }

  private async computeTrendViewLineChart(
    dto: DspChartQueryDto,
    tenantId: string,
  ): Promise<TrendViewLineChartItem[]> {
    const { joinSql, filterSql, params } = this.buildDspFilters(
      tenantId,
      dto.pgDspId,
      dto.dspReportId,
      dto.releaseType,
    );
    params.from = dto.fromDate;
    params.to = dto.toDate;

    const sql = `
      SELECT
        formatDateTime(toStartOfMonth(s.reporting_date), '%Y-%m') AS period,
        sum(s.total_quantity) AS total_views
      FROM ${CLICKHOUSE_TABLES.TRENDS_DSP_DAILY_CUBE} s
      ${joinSql}
      WHERE s.reporting_date >= toDate({from:String}) AND s.reporting_date <= toDate({to:String})
        ${filterSql}
      GROUP BY period
      ORDER BY period ASC
    `;
    const rows = await this.clickHouseService.query<{
      period: string;
      total_views: string;
    }>(sql, params);
    return rows.map((row) => ({
      period: row.period,
      totalViews: Number(row.total_views),
    }));
  }

  // ─────────────────────────────────────────────────────
  // REVENUE LINE CHART (monthly)
  // ─────────────────────────────────────────────────────
  async getRevenueLineChart(
    dto: DspChartQueryDto,
    tenantId: string,
  ): Promise<RevenueLineChartItem[]> {
    const key = this.cache.buildKey('dsp:rev-line-chart', tenantId, dto);
    return this.cache.wrap(key, () =>
      this.computeRevenueLineChart(dto, tenantId),
    );
  }

  private async computeRevenueLineChart(
    dto: DspChartQueryDto,
    tenantId: string,
  ): Promise<RevenueLineChartItem[]> {
    const fromDate = normalizeDateToFirstOfMonth(dto.fromDate);
    const toDate = normalizeDateToFirstOfMonth(dto.toDate);
    const { joinSql, filterSql, params } = this.buildDspFilters(
      tenantId,
      dto.pgDspId,
      dto.dspReportId,
      dto.releaseType,
    );
    params.from = fromDate;
    params.to = toDate;

    const sql = `
      SELECT
        formatDateTime(s.period, '%Y-%m') AS period,
        sum(s.total_revenue_usd) AS revenue_usd,
        sum(s.total_quantity) AS quantity
      FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
      ${joinSql}
      WHERE s.period >= toDate({from:String}) AND s.period <= toDate({to:String})
        ${filterSql}
      GROUP BY period
      ORDER BY period ASC
    `;
    const rows = await this.clickHouseService.query<{
      period: string;
      revenue_usd: string;
      quantity: string;
    }>(sql, params);
    return rows.map((row) => ({
      period: row.period,
      revenueUsd: this.revenueNumber(row.revenue_usd),
      revenueUsdExact: this.revenueExact(row.revenue_usd),
      quantity: Number(row.quantity),
    }));
  }

  // ─────────────────────────────────────────────────────
  // TREND VIEW TERRITORY BAR CHART (top 5 + Other)
  // ─────────────────────────────────────────────────────
  async getTrendViewTerritoryBarChart(
    dto: DspChartQueryDto,
    tenantId: string,
  ): Promise<TerritoryBarChartItem[]> {
    const key = this.cache.buildKey('dsp:trend-ter-bar', tenantId, dto);
    return this.cache.wrap(key, () =>
      this.computeTrendViewTerritoryBarChart(dto, tenantId),
    );
  }

  private async computeTrendViewTerritoryBarChart(
    dto: DspChartQueryDto,
    tenantId: string,
  ): Promise<TerritoryBarChartItem[]> {
    const fromDate = normalizeDateToFirstOfMonth(dto.fromDate);
    const toDate = normalizeDateToFirstOfMonth(dto.toDate);
    const { joinSql, filterSql, params } = this.buildDspFilters(
      tenantId,
      dto.pgDspId,
      dto.dspReportId,
      dto.releaseType,
    );
    params.from = fromDate;
    params.to = toDate;

    const totalSql = `
      SELECT sum(s.total_quantity) AS total_views
      FROM ${CLICKHOUSE_TABLES.TRENDS_TER_MONTHLY} s
      ${joinSql}
      WHERE s.period >= toDate({from:String}) AND s.period <= toDate({to:String})
        ${filterSql}
    `;
    const totalRows = await this.clickHouseService.query<{ total_views: string }>(
      totalSql,
      params,
    );
    const grandTotal = Number(totalRows[0]?.total_views ?? 0);

    const sql = `
      SELECT
        s.territory_code AS territory,
        sum(s.total_quantity) AS total_views
      FROM ${CLICKHOUSE_TABLES.TRENDS_TER_MONTHLY} s
      ${joinSql}
      WHERE s.period >= toDate({from:String}) AND s.period <= toDate({to:String})
        ${filterSql}
      GROUP BY territory
      ORDER BY total_views DESC
      LIMIT 5
    `;
    const rows = await this.clickHouseService.query<{
      territory: string;
      total_views: string;
    }>(sql, params);

    const items: TerritoryBarChartItem[] = rows.map((row) => ({
      territory: row.territory,
      totalViews: Number(row.total_views),
    }));
    const top5Total = items.reduce((acc, item) => acc + (item.totalViews ?? 0), 0);
    const otherViews = grandTotal - top5Total;
    if (otherViews > 0) {
      items.push({ territory: 'Other', totalViews: otherViews });
    }
    return this.mapTerritoryCodesToCountryNames(items);
  }

  // ─────────────────────────────────────────────────────
  // REVENUE TERRITORY BAR CHART (top 5 + Other)
  // ─────────────────────────────────────────────────────
  async getRevenueTerritoryBarChart(
    dto: DspChartQueryDto,
    tenantId: string,
  ): Promise<TerritoryBarChartItem[]> {
    const key = this.cache.buildKey('dsp:rev-ter-bar', tenantId, dto);
    return this.cache.wrap(key, () =>
      this.computeRevenueTerritoryBarChart(dto, tenantId),
    );
  }

  private async computeRevenueTerritoryBarChart(
    dto: DspChartQueryDto,
    tenantId: string,
  ): Promise<TerritoryBarChartItem[]> {
    const fromDate = normalizeDateToFirstOfMonth(dto.fromDate);
    const toDate = normalizeDateToFirstOfMonth(dto.toDate);
    const { joinSql, filterSql, params } = this.buildDspFilters(
      tenantId,
      dto.pgDspId,
      dto.dspReportId,
      dto.releaseType,
    );
    params.from = fromDate;
    params.to = toDate;

    const totalSql = `
      SELECT sum(s.total_revenue_usd) AS total_rev
      FROM ${CLICKHOUSE_TABLES.SALES_TER_MONTHLY} s
      ${joinSql}
      WHERE s.period >= toDate({from:String}) AND s.period <= toDate({to:String})
        ${filterSql}
    `;
    const totalRows = await this.clickHouseService.query<{ total_rev: string }>(
      totalSql,
      params,
    );
    const grandTotalExact = this.revenueExact(totalRows[0]?.total_rev);

    const sql = `
      SELECT
        s.territory_code AS territory,
        sum(s.total_revenue_usd) AS revenue_usd
      FROM ${CLICKHOUSE_TABLES.SALES_TER_MONTHLY} s
      ${joinSql}
      WHERE s.period >= toDate({from:String}) AND s.period <= toDate({to:String})
        ${filterSql}
      GROUP BY territory
      ORDER BY revenue_usd DESC
      LIMIT 5
    `;
    const rows = await this.clickHouseService.query<{
      territory: string;
      revenue_usd: string;
    }>(sql, params);

    const items: TerritoryBarChartItem[] = rows.map((row) => ({
      territory: row.territory,
      revenueUsd: this.revenueNumber(row.revenue_usd),
      revenueUsdExact: this.revenueExact(row.revenue_usd),
    }));
    const top5TotalExact = this.addRevenueExact(
      items.map((item) => item.revenueUsdExact),
    );
    const otherRevExact = this.subtractRevenueExact(grandTotalExact, top5TotalExact);
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
}
