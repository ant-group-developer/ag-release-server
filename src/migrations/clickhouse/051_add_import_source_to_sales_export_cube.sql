-- ============================================================================
-- Migration 051: Add import_source to sales_export_monthly_cube
-- Purpose:
--   Mig 026 added import_source to 6 cubes but missed sales_export_monthly_cube
--   (created later by mig 020). Export runner filters on s.import_source
--   (export-runner.ts buildFilters), which caused:
--     "Identifier 's.import_source' cannot be resolved from table with name s"
--   whenever a report export job carried an importSource filter.
--
-- Approach: DROP TABLE → CREATE TABLE (with import_source appended to the
--           sort key) → INSERT backfill from fact_sales_report. The cube is
--           rebuild-only since mig 050 dropped the MVs, so no view handling.
--
-- ORDER BY: (period, isrc, dsp_id, territory_code, import_source) —
--   import_source appended at the end so ClickHouse still scans by the
--   existing prefix before narrowing by source (same rationale as mig 026).
-- ============================================================================


DROP TABLE IF EXISTS music_analytics.sales_export_monthly_cube;

CREATE TABLE IF NOT EXISTS music_analytics.sales_export_monthly_cube
(
    period              Date,
    dsp_id              LowCardinality(String),
    territory_code      LowCardinality(String),
    isrc                String                  COMMENT 'ISRC or UPC- album-level record',
    import_source       LowCardinality(String)  DEFAULT '' COMMENT 'ftp | bombshelter | wmg_report | spotify_report | ...',

    upc                 String DEFAULT '',
    track_title         String DEFAULT '',
    album_title         String DEFAULT '',
    artist_name         String DEFAULT '',
    label_name          String DEFAULT '',

    total_usage         UInt64,
    revenue_usd         Decimal128(18)
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(period)
ORDER BY (period, isrc, dsp_id, territory_code, import_source)
COMMENT 'Pre-aggregated sales export grain by month + ISRC + DSP + territory + import_source';

INSERT INTO music_analytics.sales_export_monthly_cube
SELECT
    toStartOfMonth(f.reporting_period_start) AS period,
    f.dsp_id,
    f.territory_code,
    f.isrc,
    if(f.import_source = '', 'ftp', f.import_source) AS import_source,
    any(f.upc) AS upc,
    any(f.track_title) AS track_title,
    any(f.album_title) AS album_title,
    any(f.artist_name) AS artist_name,
    any(f.label_name) AS label_name,
    sum(f.quantity) AS total_usage,
    sum(
      if(
        f.revenue_usd != 0,
        f.revenue_usd,
        divideDecimal(f.revenue_local, if(
          toDecimal128OrDefault(toString(er.usd_to_local_rate), 18, toDecimal128(1, 18)) > 0,
          toDecimal128OrDefault(toString(er.usd_to_local_rate), 18, toDecimal128(1, 18)),
          toDecimal128(1, 18)
        ), 18)
      )
    ) AS revenue_usd
FROM music_analytics.fact_sales_report f
LEFT JOIN (SELECT * FROM music_analytics.exchange_rates FINAL) er
    ON formatDateTime(f.reporting_period_start, '%Y-%m') = er.rate_month
    AND f.revenue_currency = er.currency
GROUP BY period, f.dsp_id, f.territory_code, f.isrc, import_source;
