import { CLICKHOUSE_TABLES } from 'src/modules/clickhouse/clickhouse.constants';

export function getDspSalesTimelineTopDspsQuery(
  joinSql: string,
  joinExpr: string,
  filterSql: string,
  resolvedDspName: string,
  topN: number,
): string {
  return `
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
}

export function getDspSalesTimelineQuery(
  joinSql: string,
  joinExpr: string,
  filterSql: string,
  dspExpr: string,
  whereDsp: string,
): string {
  return `
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
}

export function getDspTrendsTimelineTopDspsQuery(
  joinSql: string,
  joinExpr: string,
  filterSql: string,
  resolvedDspName: string,
  topN: number,
): string {
  return `
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
}

export function getDspTrendsTimelineQuery(
  joinSql: string,
  joinExpr: string,
  filterSql: string,
  dspExpr: string,
  whereDsp: string,
): string {
  return `
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
}

export function getDspTrendsDailyTimelineTopDspsQuery(
  joinSql: string,
  joinExpr: string,
  filterSql: string,
  resolvedDspName: string,
  topN: number,
): string {
  return `
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
}

export function getDspTrendsDailyTimelineQuery(
  joinSql: string,
  joinExpr: string,
  filterSql: string,
  dspExpr: string,
  whereDsp: string,
): string {
  return `
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
}

export function getTerSalesTimelineTopTersQuery(
  joinSql: string,
  filterSql: string,
  topN: number,
): string {
  return `
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
}

export function getTerSalesTimelineQuery(
  joinSql: string,
  filterSql: string,
  terExpr: string,
  whereTer: string,
): string {
  return `
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
}

export function getTerTrendsTimelineTopTersQuery(
  joinSql: string,
  filterSql: string,
  topN: number,
): string {
  return `
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
}

export function getTerTrendsTimelineQuery(
  joinSql: string,
  filterSql: string,
  terExpr: string,
  whereTer: string,
): string {
  return `
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
}

export function getRevenueOverviewQuery(joinSql: string, filterSql: string): string {
  return `
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
}

export function getRevenueTimelineTopDspsQuery(
  joinSql: string,
  joinExpr: string,
  filterSql: string,
  resolvedDspName: string,
  topN: number,
): string {
  return `
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
}

export function getRevenueTimelineQuery(
  joinSql: string,
  joinExpr: string,
  filterSql: string,
  dspExpr: string,
  whereDsp: string,
): string {
  return `
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
}

export function getRevenueTopDspCountQuery(
  joinSql: string,
  joinExpr: string,
  filterSql: string,
  resolvedDspName: string,
): string {
  return `
    SELECT uniq(${resolvedDspName}) AS total
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    ${joinSql}
    ${joinExpr}
    WHERE 1=1
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
  `;
}

export function getRevenueTopDspQuery(
  joinSql: string,
  joinExpr: string,
  filterSql: string,
  resolvedDspName: string,
  limit: number,
  offset: number,
): string {
  return `
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
    LIMIT ${limit} OFFSET ${offset}
  `;
}

export function getRevenueTopDspTotalQuery(
  joinSql: string,
  joinExpr: string,
  filterSql: string,
): string {
  return `
    SELECT
      sum(s.total_quantity) AS total_qty,
      sum(s.total_revenue_usd) AS total_rev
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    ${joinSql}
    ${joinExpr}
    WHERE 1=1
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
  `;
}

export function getRevenueTopArtistCountQuery(
  filterSql: string,
  hasKeywordFilter: boolean,
): string {
  return `
    SELECT uniq(artistId) AS total
    FROM (
      SELECT arrayJoin(t.artist_ids) AS artistId
      FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
      INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc
      WHERE 1=1
        AND s.period >= toDate({from:String})
        AND s.period <= toDate({to:String})
        ${filterSql}
    )
    WHERE artistId != '' ${hasKeywordFilter ? `AND artistId IN ({matchedArtistIds:Array(String)})` : ''}
  `;
}

export function getRevenueTopArtistQuery(
  filterSql: string,
  hasKeywordFilter: boolean,
  limit: number,
  offset: number,
): string {
  return `
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
    HAVING artistId != '' ${hasKeywordFilter ? `AND artistId IN ({matchedArtistIds:Array(String)})` : ''}
    ORDER BY revenue_usd DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}

export function getRevenueTopArtistTotalQuery(
  filterSql: string,
  hasKeywordFilter: boolean,
): string {
  return `
    SELECT
      sum(s.total_quantity) AS total_qty,
      sum(s.total_revenue_usd) AS total_rev
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc
    WHERE 1=1
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
      ${hasKeywordFilter ? `AND hasAny(t.artist_ids, {matchedArtistIds:Array(String)})` : ''}
  `;
}

export function getRevenueTopTrackCountQuery(
  joinSql: string,
  filterSql: string,
): string {
  return `
    SELECT uniq(s.isrc) AS total
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    ${joinSql}
    WHERE 1=1
      AND s.isrc NOT LIKE 'UPC-%'
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
  `;
}

export function getRevenueTopTrackQuery(
  joinSql: string,
  filterSql: string,
  limit: number,
  offset: number,
): string {
  return `
    SELECT
      s.isrc AS isrc,
      sum(s.total_revenue_usd) AS revenue_usd,
      sum(s.total_quantity) AS quantity
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    ${joinSql}
    WHERE 1=1
      AND s.isrc NOT LIKE 'UPC-%'
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
    GROUP BY isrc
    ORDER BY revenue_usd DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}

export function getRevenueTopTrackFallbackQuery(): string {
  return `
    SELECT
      isrc,
      any(track_title) AS track_title,
      any(artist_name) AS artist_name
    FROM ${CLICKHOUSE_TABLES.FACT_SALES_REPORT}
    WHERE isrc IN ({isrcs:Array(String)})
    GROUP BY isrc
  `;
}

export function getRevenueTopTrackTotalQuery(
  joinSql: string,
  filterSql: string,
): string {
  return `
    SELECT
      sum(s.total_quantity) AS total_qty,
      sum(s.total_revenue_usd) AS total_rev
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    ${joinSql}
    WHERE 1=1
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
  `;
}

export function getRevenueTopLabelCountQuery(
  joinSql: string,
  filterSql: string,
): string {
  return `
    SELECT uniq(t.label_id) AS total
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    ${joinSql}
    WHERE t.is_deleted = 0
      AND t.label_id != ''
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
  `;
}

export function getRevenueTopLabelQuery(
  joinSql: string,
  filterSql: string,
  limit: number,
  offset: number,
): string {
  return `
    SELECT
      t.label_id AS labelId,
      sum(s.total_revenue_usd) AS revenue_usd,
      sum(s.total_quantity) AS quantity,
      uniq(t.release_id) AS release_count,
      uniq(t.isrc) AS track_count
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    ${joinSql}
    WHERE t.is_deleted = 0
      AND t.label_id != ''
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
    GROUP BY labelId
    ORDER BY revenue_usd DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}

export function getRevenueTopLabelTotalQuery(
  joinSql: string,
  filterSql: string,
): string {
  return `
    SELECT
      sum(s.total_quantity) AS total_qty,
      sum(s.total_revenue_usd) AS total_rev
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    ${joinSql}
    WHERE t.is_deleted = 0
      AND t.label_id != ''
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
  `;
}

export function getRevenueTopTenantCountQuery(
  joinSql: string,
  filterSql: string,
): string {
  return `
    SELECT uniq(t.tenant_id) AS total
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    ${joinSql}
    WHERE t.is_deleted = 0
      AND t.tenant_id != ''
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
  `;
}

export function getRevenueTopTenantQuery(
  joinSql: string,
  filterSql: string,
  limit: number,
  offset: number,
): string {
  return `
    SELECT
      t.tenant_id AS tenantId,
      sum(s.total_revenue_usd) AS revenue_usd,
      sum(s.total_quantity) AS quantity
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    ${joinSql}
    WHERE t.is_deleted = 0
      AND t.tenant_id != ''
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
    GROUP BY tenantId
    ORDER BY revenue_usd DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}

export function getRevenueTopTenantTotalQuery(
  joinSql: string,
  filterSql: string,
): string {
  return `
    SELECT
      sum(s.total_quantity) AS total_qty,
      sum(s.total_revenue_usd) AS total_rev
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    ${joinSql}
    WHERE t.is_deleted = 0
      AND t.tenant_id != ''
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
  `;
}

export function getRevenueTopReleaseCountQuery(
  filterSql: string,
): string {
  return `
    SELECT uniq(t.release_id) AS total
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc
    WHERE t.is_deleted = 0
      AND t.release_id != ''
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
  `;
}

export function getRevenueTopReleaseQuery(
  filterSql: string,
  limit: number,
  offset: number,
): string {
  return `
    SELECT
      t.release_id AS releaseId,
      sum(s.total_revenue_usd) AS revenue_usd,
      sum(s.total_quantity) AS quantity
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc
    WHERE t.is_deleted = 0
      AND t.release_id != ''
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
    GROUP BY releaseId
    ORDER BY revenue_usd DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
}

export function getRevenueTopReleaseTotalQuery(
  filterSql: string,
): string {
  return `
    SELECT
      sum(s.total_quantity) AS total_qty,
      sum(s.total_revenue_usd) AS total_rev
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc
    WHERE t.is_deleted = 0
      AND t.release_id != ''
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
  `;
}

export function getTrendsOverviewMainQuery(
  joinSql: string,
  filterSql: string,
): string {
  return `
    SELECT
      sum(s.total_quantity) AS total_views,
      uniq(s.dsp_id) AS total_dsps,
      uniq(s.isrc) AS total_tracks,
      uniq(t.label_id) AS total_labels
    FROM ${CLICKHOUSE_TABLES.TRENDS_DSP_DAILY_CUBE} s
    ${joinSql}
    WHERE 1=1
      AND s.reporting_date >= toDate({from:String})
      AND s.reporting_date <= toDate({to:String})
      ${filterSql}
  `;
}

export function getTrendsOverviewArtistQuery(
  joinSql: string,
  filterSql: string,
): string {
  return `
    SELECT uniq(artist_id) AS total_artists
    FROM (
      SELECT arrayJoin(t.artist_ids) AS artist_id
      FROM ${CLICKHOUSE_TABLES.TRENDS_DSP_DAILY_CUBE} s
      ${joinSql}
      WHERE 1=1
        AND s.reporting_date >= toDate({from:String})
        AND s.reporting_date <= toDate({to:String})
        ${filterSql}
    )
    WHERE artist_id != ''
  `;
}

export function getTrendViewLineChartQuery(
  joinSql: string,
  filterSql: string,
): string {
  return `
    SELECT
      formatDateTime(toStartOfMonth(s.reporting_date), '%Y-%m') AS period,
      sum(s.total_quantity) AS total_views
    FROM ${CLICKHOUSE_TABLES.TRENDS_DSP_DAILY_CUBE} s
    ${joinSql}
    WHERE 1=1
      AND s.reporting_date >= toDate({from:String})
      AND s.reporting_date <= toDate({to:String})
      ${filterSql}
    GROUP BY period
    ORDER BY period ASC
  `;
}

export function getTrendViewDspBarChartTotalQuery(
  filterSql: string,
): string {
  return `
    SELECT sum(s.total_quantity) AS total_views
    FROM ${CLICKHOUSE_TABLES.TRENDS_DSP_DAILY_CUBE} s
    INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc
    WHERE 1=1
      AND s.reporting_date >= toDate({from:String})
      AND s.reporting_date <= toDate({to:String})
      ${filterSql}
  `;
}

export function getTrendViewDspBarChartQuery(
  filterSql: string,
  resolvedDspName: string,
  joinExpr: string,
): string {
  return `
    SELECT
      ${resolvedDspName} AS dsp_name,
      sum(s.total_quantity) AS total_views
    FROM ${CLICKHOUSE_TABLES.TRENDS_DSP_DAILY_CUBE} s
    INNER JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc
    ${joinExpr}
    WHERE 1=1
      AND s.reporting_date >= toDate({from:String})
      AND s.reporting_date <= toDate({to:String})
      ${filterSql}
    GROUP BY dsp_name
    ORDER BY total_views DESC
    LIMIT 5
  `;
}

export function getRevenueLineChartQuery(
  joinSql: string,
  filterSql: string,
): string {
  return `
    SELECT
      formatDateTime(s.period, '%Y-%m') AS period,
      sum(s.total_revenue_usd) AS revenue_usd,
      sum(s.total_quantity) AS quantity
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    ${joinSql}
    WHERE 1=1
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
    GROUP BY period
    ORDER BY period ASC
  `;
}

export function getTrendViewTerritoryBarChartTotalQuery(
  joinSql: string,
  filterSql: string,
): string {
  return `
    SELECT sum(s.total_quantity) AS total_views
    FROM ${CLICKHOUSE_TABLES.TRENDS_TER_MONTHLY} s
    ${joinSql}
    WHERE 1=1
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
  `;
}

export function getTrendViewTerritoryBarChartQuery(
  joinSql: string,
  filterSql: string,
): string {
  return `
    SELECT
      s.territory_code AS territory,
      sum(s.total_quantity) AS total_views
    FROM ${CLICKHOUSE_TABLES.TRENDS_TER_MONTHLY} s
    ${joinSql}
    WHERE 1=1
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
    GROUP BY territory
    ORDER BY total_views DESC
    LIMIT 5
  `;
}

export function getRevenueDspBarChartTotalQuery(
  joinSql: string,
  filterSql: string,
): string {
  return `
    SELECT sum(s.total_revenue_usd) AS total_rev
    FROM ${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} s
    ${joinSql}
    WHERE 1=1
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
  `;
}

export function getRevenueDspBarChartQuery(
  joinSql: string,
  joinExpr: string,
  filterSql: string,
  resolvedDspName: string,
): string {
  return `
    SELECT
      ${resolvedDspName} AS dsp_name,
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
    LIMIT 5
  `;
}

export function getRevenueTerritoryBarChartTotalQuery(
  joinSql: string,
  filterSql: string,
): string {
  return `
    SELECT sum(s.total_revenue_usd) AS total_rev
    FROM ${CLICKHOUSE_TABLES.SALES_TER_MONTHLY} s
    ${joinSql}
    WHERE 1=1
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
  `;
}

export function getRevenueTerritoryBarChartQuery(
  joinSql: string,
  filterSql: string,
): string {
  return `
    SELECT
      s.territory_code AS territory,
      sum(s.total_revenue_usd) AS revenue_usd
    FROM ${CLICKHOUSE_TABLES.SALES_TER_MONTHLY} s
    ${joinSql}
    WHERE 1=1
      AND s.period >= toDate({from:String})
      AND s.period <= toDate({to:String})
      ${filterSql}
    GROUP BY territory
    ORDER BY revenue_usd DESC
    LIMIT 5
  `;
}
