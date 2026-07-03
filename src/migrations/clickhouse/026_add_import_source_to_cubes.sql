-- ============================================================================
-- Migration 026: Add import_source dimension to all analytics cubes
-- Purpose:
--   Fact tables (fact_sales_report, fact_dsp_comprehensive_report) đã có
--   import_source (mig 016). Các cubes chưa có — cần rebuild để hỗ trợ:
--     - Filter theo import_source (ftp / wmg_report / spotify_report / ...)
--     - Breakdown "tiền/view đến từ đâu" trong analytics
--
-- Approach: DROP MV → DROP TABLE → CREATE TABLE (với import_source) →
--           CREATE MV → INSERT backfill (mirror pattern mig 013 / 022)
--
-- import_source values hiện tại:
--   ftp           → Merlin (FTP ingest path)
--   wmg_report    → WMG (report-import WMG path)
--   spotify_report→ Spotify (report-import Spotify path)
--   ''            → rows cũ trước mig 016 (backfill về 'ftp' là an toàn)
--
-- Cubes affected (6):
--   1. sales_dsp_monthly_cube_v2  (from fact_sales_report)
--   2. sales_ter_monthly_cube_v2  (from fact_sales_report)
--   3. trends_dsp_daily_cube      (from fact_dsp_comprehensive_report)
--   4. trends_dsp_monthly_cube    (from fact_dsp_comprehensive_report)
--   5. trends_ter_monthly_cube    (from fact_dsp_comprehensive_report)
--   6. trends_isrc_daily_cube     (from fact_dsp_comprehensive_report)
--
-- ORDER BY: import_source thêm vào cuối sort key để không làm đảo
--   cardinality (isrc là prefix vẫn giữ — ClickHouse scan by isrc trước).
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. sales_dsp_monthly_cube_v2
--    ORDER BY (isrc, dsp_id, period) → (isrc, dsp_id, period, import_source)
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS music_analytics.sales_dsp_monthly_cube_v2_mv;
DROP TABLE IF EXISTS music_analytics.sales_dsp_monthly_cube_v2;

CREATE TABLE IF NOT EXISTS music_analytics.sales_dsp_monthly_cube_v2
(
    period              Date,
    dsp_id              LowCardinality(String),
    isrc                String                  COMMENT 'ISRC or UPC- album-level record',
    import_source       LowCardinality(String)  DEFAULT '' COMMENT 'ftp | wmg_report | spotify_report | ...',
    total_quantity      UInt64,
    total_revenue_usd   Decimal128(18)
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(period)
ORDER BY (isrc, dsp_id, period, import_source)
COMMENT 'Pre-aggregated sales by DSP + ISRC + month + import_source với revenue đã quy đổi sang USD';

CREATE MATERIALIZED VIEW IF NOT EXISTS music_analytics.sales_dsp_monthly_cube_v2_mv
TO music_analytics.sales_dsp_monthly_cube_v2
AS SELECT
    toStartOfMonth(f.reporting_period_start) AS period,
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
GROUP BY period, f.dsp_id, f.isrc, import_source;

INSERT INTO music_analytics.sales_dsp_monthly_cube_v2
SELECT
    toStartOfMonth(f.reporting_period_start) AS period,
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
GROUP BY period, f.dsp_id, f.isrc, import_source;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. sales_ter_monthly_cube_v2
--    ORDER BY (isrc, territory_code, period) → (isrc, territory_code, period, import_source)
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS music_analytics.sales_ter_monthly_cube_v2_mv;
DROP TABLE IF EXISTS music_analytics.sales_ter_monthly_cube_v2;

CREATE TABLE IF NOT EXISTS music_analytics.sales_ter_monthly_cube_v2
(
    period              Date,
    territory_code      LowCardinality(String),
    isrc                String                  COMMENT 'ISRC or UPC- album-level record',
    import_source       LowCardinality(String)  DEFAULT '' COMMENT 'ftp | wmg_report | spotify_report | ...',
    total_quantity      UInt64,
    total_revenue_usd   Decimal128(18)
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(period)
ORDER BY (isrc, territory_code, period, import_source)
COMMENT 'Pre-aggregated sales by Territory + ISRC + month + import_source với revenue đã quy đổi sang USD';

CREATE MATERIALIZED VIEW IF NOT EXISTS music_analytics.sales_ter_monthly_cube_v2_mv
TO music_analytics.sales_ter_monthly_cube_v2
AS SELECT
    toStartOfMonth(f.reporting_period_start) AS period,
    f.territory_code,
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
GROUP BY period, f.territory_code, f.isrc, import_source;

INSERT INTO music_analytics.sales_ter_monthly_cube_v2
SELECT
    toStartOfMonth(f.reporting_period_start) AS period,
    f.territory_code,
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
GROUP BY period, f.territory_code, f.isrc, import_source;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. trends_dsp_daily_cube
--    ORDER BY (isrc, dsp_id, reporting_date) → (isrc, dsp_id, reporting_date, import_source)
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS music_analytics.trends_dsp_daily_cube_mv;
DROP TABLE IF EXISTS music_analytics.trends_dsp_daily_cube;

CREATE TABLE IF NOT EXISTS music_analytics.trends_dsp_daily_cube
(
    reporting_date      Date,
    dsp_id              LowCardinality(String),
    isrc                String                  COMMENT 'ISRC or UPC- album-level record',
    import_source       LowCardinality(String)  DEFAULT '' COMMENT 'ftp | wmg_report | spotify_report | ...',
    total_quantity      UInt64,
    total_unique_users  UInt64
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(reporting_date)
ORDER BY (isrc, dsp_id, reporting_date, import_source)
COMMENT 'Pre-aggregated trends data by ISRC + DSP + day + import_source for DSP-filtered ranking analytics';

CREATE MATERIALIZED VIEW IF NOT EXISTS music_analytics.trends_dsp_daily_cube_mv
TO music_analytics.trends_dsp_daily_cube
AS SELECT
    reporting_period AS reporting_date,
    dsp_id,
    isrc,
    if(import_source = '', 'ftp', import_source) AS import_source,
    sum(quantity_total)        AS total_quantity,
    sum(quantity_unique_users) AS total_unique_users
FROM music_analytics.fact_dsp_comprehensive_report
GROUP BY reporting_date, dsp_id, isrc, import_source;

INSERT INTO music_analytics.trends_dsp_daily_cube
SELECT
    reporting_period AS reporting_date,
    dsp_id,
    isrc,
    if(import_source = '', 'ftp', import_source) AS import_source,
    sum(quantity_total)        AS total_quantity,
    sum(quantity_unique_users) AS total_unique_users
FROM music_analytics.fact_dsp_comprehensive_report
GROUP BY reporting_date, dsp_id, isrc, import_source;


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. trends_dsp_monthly_cube
--    ORDER BY (isrc, dsp_id, period) → (isrc, dsp_id, period, import_source)
--    Giữ WHERE source_category IN ('trends', 'usage') từ mig 005
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS music_analytics.trends_dsp_monthly_cube_mv;
DROP TABLE IF EXISTS music_analytics.trends_dsp_monthly_cube;

CREATE TABLE IF NOT EXISTS music_analytics.trends_dsp_monthly_cube
(
    period          Date,
    dsp_id          LowCardinality(String),
    isrc            String                  COMMENT 'ISRC or UPC- album-level record',
    import_source   LowCardinality(String)  DEFAULT '' COMMENT 'ftp | wmg_report | spotify_report | ...',
    total_quantity  UInt64
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(period)
ORDER BY (isrc, dsp_id, period, import_source)
COMMENT 'Pre-aggregated trends data by DSP + ISRC + month + import_source for DSP trend timeline';

CREATE MATERIALIZED VIEW IF NOT EXISTS music_analytics.trends_dsp_monthly_cube_mv
TO music_analytics.trends_dsp_monthly_cube
AS SELECT
    toStartOfMonth(reporting_period) AS period,
    dsp_id,
    isrc,
    if(import_source = '', 'ftp', import_source) AS import_source,
    sum(quantity_total) AS total_quantity
FROM music_analytics.fact_dsp_comprehensive_report
WHERE source_category IN ('trends', 'usage')
GROUP BY period, dsp_id, isrc, import_source;

INSERT INTO music_analytics.trends_dsp_monthly_cube
SELECT
    toStartOfMonth(reporting_period) AS period,
    dsp_id,
    isrc,
    if(import_source = '', 'ftp', import_source) AS import_source,
    sum(quantity_total) AS total_quantity
FROM music_analytics.fact_dsp_comprehensive_report
WHERE source_category IN ('trends', 'usage')
GROUP BY period, dsp_id, isrc, import_source;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. trends_ter_monthly_cube
--    ORDER BY (isrc, territory_code, period) → (isrc, territory_code, period, import_source)
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS music_analytics.trends_ter_monthly_cube_mv;
DROP TABLE IF EXISTS music_analytics.trends_ter_monthly_cube;

CREATE TABLE IF NOT EXISTS music_analytics.trends_ter_monthly_cube
(
    period          Date,
    territory_code  LowCardinality(String),
    isrc            String                  COMMENT 'ISRC or UPC- album-level record',
    import_source   LowCardinality(String)  DEFAULT '' COMMENT 'ftp | wmg_report | spotify_report | ...',
    total_quantity  UInt64
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(period)
ORDER BY (isrc, territory_code, period, import_source)
COMMENT 'Pre-aggregated trends data by Territory + ISRC + month + import_source';

CREATE MATERIALIZED VIEW IF NOT EXISTS music_analytics.trends_ter_monthly_cube_mv
TO music_analytics.trends_ter_monthly_cube
AS SELECT
    toStartOfMonth(reporting_period) AS period,
    territory_code,
    isrc,
    if(import_source = '', 'ftp', import_source) AS import_source,
    sum(quantity_total) AS total_quantity
FROM music_analytics.fact_dsp_comprehensive_report
WHERE source_category IN ('trends', 'usage')
GROUP BY period, territory_code, isrc, import_source;

INSERT INTO music_analytics.trends_ter_monthly_cube
SELECT
    toStartOfMonth(reporting_period) AS period,
    territory_code,
    isrc,
    if(import_source = '', 'ftp', import_source) AS import_source,
    sum(quantity_total) AS total_quantity
FROM music_analytics.fact_dsp_comprehensive_report
WHERE source_category IN ('trends', 'usage')
GROUP BY period, territory_code, isrc, import_source;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. trends_isrc_daily_cube
--    ORDER BY (isrc, reporting_date) → (isrc, reporting_date, import_source)
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS music_analytics.trends_isrc_daily_cube_mv;
DROP TABLE IF EXISTS music_analytics.trends_isrc_daily_cube;

CREATE TABLE IF NOT EXISTS music_analytics.trends_isrc_daily_cube
(
    reporting_date      Date,
    isrc                String                  COMMENT 'ISRC or UPC- album-level record',
    import_source       LowCardinality(String)  DEFAULT '' COMMENT 'ftp | wmg_report | spotify_report | ...',
    total_quantity      UInt64,
    total_unique_users  UInt64
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(reporting_date)
ORDER BY (isrc, reporting_date, import_source)
COMMENT 'Pre-aggregated trends data by ISRC + day + import_source for ranking analytics';

CREATE MATERIALIZED VIEW IF NOT EXISTS music_analytics.trends_isrc_daily_cube_mv
TO music_analytics.trends_isrc_daily_cube
AS SELECT
    reporting_period AS reporting_date,
    isrc,
    if(import_source = '', 'ftp', import_source) AS import_source,
    sum(quantity_total)        AS total_quantity,
    sum(quantity_unique_users) AS total_unique_users
FROM music_analytics.fact_dsp_comprehensive_report
GROUP BY reporting_date, isrc, import_source;

INSERT INTO music_analytics.trends_isrc_daily_cube
SELECT
    reporting_period AS reporting_date,
    isrc,
    if(import_source = '', 'ftp', import_source) AS import_source,
    sum(quantity_total)        AS total_quantity,
    sum(quantity_unique_users) AS total_unique_users
FROM music_analytics.fact_dsp_comprehensive_report
GROUP BY reporting_date, isrc, import_source;
