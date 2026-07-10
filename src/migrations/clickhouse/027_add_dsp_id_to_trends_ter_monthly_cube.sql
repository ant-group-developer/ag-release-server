-- ============================================================================
-- Migration 027: Add dsp_id to trends_ter_monthly_cube + sales_ter_monthly_cube_v2
-- Purpose:
--   Cả hai bảng hiện không có dsp_id. Các analytics query "DSP breakdown by
--   territory" (trend-view DSP timeline, revenue DSP timeline, top DSPs in
--   territory) cần dsp_id để GROUP BY DSP.
--
-- Approach: DROP MV → DROP TABLE → CREATE TABLE (với dsp_id) →
--           CREATE MV → INSERT backfill (mirror pattern mig 026)
-- ============================================================================

DROP VIEW IF EXISTS music_analytics.trends_ter_monthly_cube_mv;
DROP TABLE IF EXISTS music_analytics.trends_ter_monthly_cube;

CREATE TABLE IF NOT EXISTS music_analytics.trends_ter_monthly_cube
(
    period          Date,
    territory_code  LowCardinality(String),
    dsp_id          LowCardinality(String),
    isrc            String                  COMMENT 'International Standard Recording Code. If it starts with ''UPC-'', it represents an album-level (UPC) record instead of a track-level ISRC.',
    import_source   LowCardinality(String)  DEFAULT '' COMMENT 'ftp | wmg_report | spotify_report | ...',
    total_quantity  UInt64
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(period)
ORDER BY (isrc, territory_code, dsp_id, period, import_source)
COMMENT 'Pre-aggregated trends data by Territory + DSP + ISRC + month + import_source';

CREATE MATERIALIZED VIEW IF NOT EXISTS music_analytics.trends_ter_monthly_cube_mv
TO music_analytics.trends_ter_monthly_cube
AS SELECT
    toStartOfMonth(reporting_period) AS period,
    territory_code,
    dsp_id,
    isrc,
    if(import_source = '', 'ftp', import_source) AS import_source,
    sum(quantity_total) AS total_quantity
FROM music_analytics.fact_dsp_comprehensive_report
WHERE source_category IN ('trends', 'usage')
GROUP BY period, territory_code, dsp_id, isrc, import_source;

INSERT INTO music_analytics.trends_ter_monthly_cube
SELECT
    toStartOfMonth(reporting_period) AS period,
    territory_code,
    dsp_id,
    isrc,
    if(import_source = '', 'ftp', import_source) AS import_source,
    sum(quantity_total) AS total_quantity
FROM music_analytics.fact_dsp_comprehensive_report
WHERE source_category IN ('trends', 'usage')
GROUP BY period, territory_code, dsp_id, isrc, import_source;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. sales_ter_monthly_cube_v2
--    Thêm dsp_id để hỗ trợ revenue breakdown by DSP within territory
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS music_analytics.sales_ter_monthly_cube_v2_mv;
DROP TABLE IF EXISTS music_analytics.sales_ter_monthly_cube_v2;

CREATE TABLE IF NOT EXISTS music_analytics.sales_ter_monthly_cube_v2
(
    period              Date,
    territory_code      LowCardinality(String),
    dsp_id              LowCardinality(String),
    isrc                String                  COMMENT 'ISRC or UPC- album-level record',
    import_source       LowCardinality(String)  DEFAULT '' COMMENT 'ftp | wmg_report | spotify_report | ...',
    total_quantity      UInt64,
    total_revenue_usd   Decimal128(18)
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(period)
ORDER BY (isrc, territory_code, dsp_id, period, import_source)
COMMENT 'Pre-aggregated sales by Territory + DSP + ISRC + month + import_source với revenue đã quy đổi sang USD';

CREATE MATERIALIZED VIEW IF NOT EXISTS music_analytics.sales_ter_monthly_cube_v2_mv
TO music_analytics.sales_ter_monthly_cube_v2
AS SELECT
    toStartOfMonth(f.reporting_period_start) AS period,
    f.territory_code,
    f.dsp_id,
    f.isrc,
    if(f.import_source = '', 'ftp', f.import_source) AS import_source,
    sum(f.quantity) AS total_quantity,
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
    ) AS total_revenue_usd
FROM music_analytics.fact_sales_report f
LEFT JOIN music_analytics.exchange_rates er
    ON formatDateTime(f.reporting_period_start, '%Y-%m') = er.rate_month
    AND f.revenue_currency = er.currency
GROUP BY period, f.territory_code, f.dsp_id, f.isrc, import_source;

INSERT INTO music_analytics.sales_ter_monthly_cube_v2
SELECT
    toStartOfMonth(f.reporting_period_start) AS period,
    f.territory_code,
    f.dsp_id,
    f.isrc,
    if(f.import_source = '', 'ftp', f.import_source) AS import_source,
    sum(f.quantity) AS total_quantity,
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
    ) AS total_revenue_usd
FROM music_analytics.fact_sales_report f
LEFT JOIN (SELECT * FROM music_analytics.exchange_rates FINAL) er
    ON formatDateTime(f.reporting_period_start, '%Y-%m') = er.rate_month
    AND f.revenue_currency = er.currency
GROUP BY period, f.territory_code, f.dsp_id, f.isrc, import_source;
