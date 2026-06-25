import { CLICKHOUSE_TABLES } from 'src/modules/clickhouse/clickhouse.constants';

export function getRawDetailsPageQuery(
  resolvedDspName: string,
  commonJoinsSql: string,
  whereSql: string,
  pagingSql: string,
): string {
  return `
    SELECT
      formatDateTime(s.period, '%Y-%m') AS date,
      formatDateTime(s.period, '%Y-%m-01') AS start_date,
      formatDateTime(addDays(addMonths(toStartOfMonth(s.period), 1), -1), '%Y-%m-%d') AS end_date,
      s.dsp_id AS dsp_id,
      ${resolvedDspName} AS dsp_name,
      s.territory_code AS territory,
      s.isrc AS isrc,
      any(t.tenant_id) AS tenant_id,
      any(t.release_id) AS release_id,
      any(t.label_id) AS label_id,
      any(s.upc) AS fallback_upc,
      any(s.track_title) AS fallback_track_title,
      any(s.album_title) AS fallback_album_title,
      any(s.artist_name) AS fallback_artist_name,
      any(s.label_name) AS fallback_label_name,
      sum(s.total_usage) AS total_usage,
      toString(sum(s.revenue_usd)) AS revenue_usd
    FROM ${CLICKHOUSE_TABLES.SALES_EXPORT_MONTHLY} s
    ${commonJoinsSql}
    ${whereSql}
    GROUP BY date, start_date, end_date, s.dsp_id, dsp_name, territory, isrc
    ORDER BY date ASC, dsp_name ASC, territory ASC, isrc ASC
    ${pagingSql}
  `;
}

export function getTrackMetadataQuery(): string {
  return `
    SELECT
      t.isrc AS isrc,
      COALESCE(NULLIF(ten.title, ''), ten.name, '') AS workspace_name,
      r.title AS release_title,
      COALESCE(r.upc, '') AS release_upc,
      COALESCE(r.catalog_id, '') AS catalog_id,
      r.release_date AS release_date,
      t.title AS track_title,
      COALESCE(l.name, '') AS label_name,
      COALESCE(string_agg(DISTINCT a.name, ', '), '') AS artist_names
    FROM tracks t
    INNER JOIN releases r ON r.id = t.release_id
    LEFT JOIN labels l ON l.id = r.label_id
    LEFT JOIN tenants ten ON ten.id = r.tenant_id
    LEFT JOIN track_artist ta ON ta.track_id = t.id
    LEFT JOIN artists a ON a.id = ta.artist_id
    WHERE t.isrc = ANY($1)
    GROUP BY t.isrc, ten.title, ten.name, r.title, r.upc, r.catalog_id, r.release_date, t.title, l.name
  `;
}

export function getTenantNamesQuery(): string {
  return `
    SELECT
      id::text AS id,
      COALESCE(NULLIF(title, ''), name, id::text) AS tenant_name
    FROM tenants
    WHERE id = ANY($1)
  `;
}

export function getReleaseMetadataByUpcQuery(): string {
  return `
    SELECT
      r.upc AS upc,
      COALESCE(NULLIF(ten.title, ''), ten.name, '') AS workspace_name,
      r.title AS release_title,
      COALESCE(r.upc, '') AS release_upc,
      COALESCE(r.catalog_id, '') AS catalog_id,
      r.release_date AS release_date,
      '' AS track_title,
      COALESCE(l.name, '') AS label_name,
      COALESCE(string_agg(DISTINCT a.name, ', '), '') AS artist_names
    FROM releases r
    LEFT JOIN labels l ON l.id = r.label_id
    LEFT JOIN tenants ten ON ten.id = r.tenant_id
    LEFT JOIN release_artist ra ON ra.release_id = r.id
    LEFT JOIN artists a ON a.id = ra.artist_id
    WHERE r.upc = ANY($1)
    GROUP BY r.upc, ten.title, ten.name, r.title, r.catalog_id, r.release_date, l.name
  `;
}

export function getUniqueIdentifiersQuery(
  commonJoinsSql: string,
  whereSql: string,
): string {
  return `
    SELECT
      s.isrc AS isrc,
      any(t.tenant_id) AS tenant_id
    FROM ${CLICKHOUSE_TABLES.SALES_EXPORT_MONTHLY} s
    ${commonJoinsSql}
    ${whereSql}
    GROUP BY s.isrc
  `;
}
