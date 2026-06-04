-- ============================================================================
-- Migration 013: Recreate Sales Cubes v2 with USD Revenue
-- Purpose: Chuyển đổi sales_dsp_monthly_cube và sales_ter_monthly_cube
--          sang phiên bản v2 có pre-converted total_revenue_usd.
--          MV mới JOIN với exchange_rates để quy đổi revenue sang USD
--          ngay tại thời điểm INSERT vào fact_sales_report.
-- Flow:    fact_sales_report INSERT → MV fires → JOIN exchange_rates → cube v2
-- NOTE:    Backfill KHÔNG chạy ở đây vì exchange_rates chưa có data.
--          Gọi POST /etl/exchange-rates/backfill sau khi app start.
-- ============================================================================

-- ──────────────────────────────────────────────────────────
-- 1. Drop old MVs (Materialized Views phải drop trước tables)
-- ──────────────────────────────────────────────────────────
DROP VIEW IF EXISTS music_analytics.sales_dsp_monthly_cube_mv;

DROP VIEW IF EXISTS music_analytics.sales_ter_monthly_cube_mv;

-- ──────────────────────────────────────────────────────────
-- 2. Drop old integration views
-- ──────────────────────────────────────────────────────────
DROP VIEW IF EXISTS music_analytics.v_sales_dsp_monthly;

-- ──────────────────────────────────────────────────────────
-- 3. Drop old tables
-- ──────────────────────────────────────────────────────────
DROP TABLE IF EXISTS music_analytics.sales_dsp_monthly_cube;

DROP TABLE IF EXISTS music_analytics.sales_ter_monthly_cube;

-- ──────────────────────────────────────────────────────────
-- 4. Create v2 tables (với total_revenue_usd đã quy đổi sẵn)
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS music_analytics.sales_dsp_monthly_cube_v2
(
    period              Date,
    dsp_id              LowCardinality(String),
    isrc                String,
    total_quantity      UInt64,
    total_revenue_usd   Decimal128(18)
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(period)
ORDER BY (isrc, dsp_id, period)
COMMENT 'Pre-aggregated sales by DSP + ISRC + month với revenue đã quy đổi sang USD';

CREATE TABLE IF NOT EXISTS music_analytics.sales_ter_monthly_cube_v2
(
    period              Date,
    territory_code      LowCardinality(String),
    isrc                String,
    total_quantity      UInt64,
    total_revenue_usd   Decimal128(18)
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(period)
ORDER BY (isrc, territory_code, period)
COMMENT 'Pre-aggregated sales by Territory + ISRC + month với revenue đã quy đổi sang USD';

-- ──────────────────────────────────────────────────────────
-- 5. Create v2 Materialized Views (JOIN exchange_rates khi INSERT)
--    Khi INSERT vào fact_sales_report, MV sẽ:
--    - LEFT JOIN exchange_rates để lấy tỷ giá
--    - Chia revenue_local / rate để tính revenue_usd
--    - Fallback: nếu rate = 0 hoặc không tìm thấy → chia cho 1
-- ──────────────────────────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS music_analytics.sales_dsp_monthly_cube_v2_mv
TO music_analytics.sales_dsp_monthly_cube_v2
AS SELECT
    toStartOfMonth(f.reporting_period_start) AS period,
    f.dsp_id,
    f.isrc,
    sum(f.quantity) AS total_quantity,
    sum(f.revenue_local / if(er.rate > 0, er.rate, 1)) AS total_revenue_usd
FROM music_analytics.fact_sales_report f
LEFT JOIN music_analytics.exchange_rates er
    ON formatDateTime(f.reporting_period_start, '%Y-%m') = er.rate_month
    AND f.revenue_currency = er.currency
GROUP BY period, f.dsp_id, f.isrc;

CREATE MATERIALIZED VIEW IF NOT EXISTS music_analytics.sales_ter_monthly_cube_v2_mv
TO music_analytics.sales_ter_monthly_cube_v2
AS SELECT
    toStartOfMonth(f.reporting_period_start) AS period,
    f.territory_code,
    f.isrc,
    sum(f.quantity) AS total_quantity,
    sum(f.revenue_local / if(er.rate > 0, er.rate, 1)) AS total_revenue_usd
FROM music_analytics.fact_sales_report f
LEFT JOIN music_analytics.exchange_rates er
    ON formatDateTime(f.reporting_period_start, '%Y-%m') = er.rate_month
    AND f.revenue_currency = er.currency
GROUP BY period, f.territory_code, f.isrc;

-- ──────────────────────────────────────────────────────────
-- 6. Recreate v_sales_dsp_monthly view pointing to v2 table
-- ──────────────────────────────────────────────────────────
CREATE VIEW IF NOT EXISTS music_analytics.v_sales_dsp_monthly AS
SELECT
    s.period,
    s.dsp_id,
    r.dsp_name as dsp_name,
    r.pg_uuid as pg_uuid,
    p.dsp_name as pg_dsp_name,
    p.dsp_code as pg_dsp_code,
    s.total_quantity,
    s.total_revenue_usd
FROM music_analytics.sales_dsp_monthly_cube_v2 s
LEFT JOIN music_analytics.dsps_report r ON s.dsp_id = r.id_dsps_report
LEFT JOIN music_analytics.pg_dsps_sync p ON r.pg_uuid = p.pg_uuid;
