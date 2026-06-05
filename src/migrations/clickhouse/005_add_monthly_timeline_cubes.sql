-- ============================================================================
-- Migration 005: Add Monthly Timeline Cubes
-- Purpose: Tạo các cubes pre-aggregated hàng tháng để phục vụ tối ưu hóa các API:
--   1. trends_dsp_monthly_cube - Thống kê DSP từ dữ liệu Trends
--   2. sales_ter_monthly_cube  - Thống kê Quốc gia từ dữ liệu Sales (Doanh thu + Lượt nghe)
--   3. trends_ter_monthly_cube - Thống kê Quốc gia từ dữ liệu Trends
-- ============================================================================

-- 1. CUBE: trends_dsp_monthly_cube
CREATE TABLE IF NOT EXISTS music_analytics.trends_dsp_monthly_cube
(
    period          Date,
    dsp_id          LowCardinality(String),
    isrc            String                  COMMENT 'International Standard Recording Code. If it starts with ''UPC-'', it represents an album-level (UPC) record instead of a track-level ISRC.',
    total_quantity  UInt64
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(period)
ORDER BY (isrc, dsp_id, period)
COMMENT 'Pre-aggregated trends data by DSP + ISRC + month for DSP trend timeline';

CREATE MATERIALIZED VIEW IF NOT EXISTS music_analytics.trends_dsp_monthly_cube_mv
TO music_analytics.trends_dsp_monthly_cube
AS SELECT
    toStartOfMonth(reporting_period) AS period,
    dsp_id,
    isrc,
    sum(quantity_total) AS total_quantity
FROM music_analytics.fact_dsp_comprehensive_report
WHERE source_category IN ('trends', 'usage')
GROUP BY period, dsp_id, isrc;

-- Backfill trends_dsp_monthly_cube
INSERT INTO music_analytics.trends_dsp_monthly_cube
SELECT
    toStartOfMonth(reporting_period) AS period,
    dsp_id,
    isrc,
    sum(quantity_total) AS total_quantity
FROM music_analytics.fact_dsp_comprehensive_report
WHERE source_category IN ('trends', 'usage')
GROUP BY period, dsp_id, isrc;


-- 2. CUBE: sales_ter_monthly_cube
CREATE TABLE IF NOT EXISTS music_analytics.sales_ter_monthly_cube
(
    period            Date,
    territory_code    LowCardinality(String),
    isrc              String                  COMMENT 'International Standard Recording Code. If it starts with ''UPC-'', it represents an album-level (UPC) record instead of a track-level ISRC.',
    total_quantity    UInt64
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(period)
ORDER BY (isrc, territory_code, period)
COMMENT 'Pre-aggregated sales data by Territory + ISRC + month for Territory sales timeline';

CREATE MATERIALIZED VIEW IF NOT EXISTS music_analytics.sales_ter_monthly_cube_mv
TO music_analytics.sales_ter_monthly_cube
AS SELECT
    toStartOfMonth(reporting_period_start) AS period,
    territory_code,
    isrc,
    sum(quantity) AS total_quantity
FROM music_analytics.fact_sales_report
GROUP BY period, territory_code, isrc;

-- Backfill sales_ter_monthly_cube
INSERT INTO music_analytics.sales_ter_monthly_cube
SELECT
    toStartOfMonth(reporting_period_start) AS period,
    territory_code,
    isrc,
    sum(quantity) AS total_quantity
FROM music_analytics.fact_sales_report
GROUP BY period, territory_code, isrc;


-- 3. CUBE: trends_ter_monthly_cube
CREATE TABLE IF NOT EXISTS music_analytics.trends_ter_monthly_cube
(
    period          Date,
    territory_code  LowCardinality(String),
    isrc            String                  COMMENT 'International Standard Recording Code. If it starts with ''UPC-'', it represents an album-level (UPC) record instead of a track-level ISRC.',
    total_quantity  UInt64
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(period)
ORDER BY (isrc, territory_code, period)
COMMENT 'Pre-aggregated trends data by Territory + ISRC + month for Territory trend timeline';

CREATE MATERIALIZED VIEW IF NOT EXISTS music_analytics.trends_ter_monthly_cube_mv
TO music_analytics.trends_ter_monthly_cube
AS SELECT
    toStartOfMonth(reporting_period) AS period,
    territory_code,
    isrc,
    sum(quantity_total) AS total_quantity
FROM music_analytics.fact_dsp_comprehensive_report
WHERE source_category IN ('trends', 'usage')
GROUP BY period, territory_code, isrc;

-- Backfill trends_ter_monthly_cube
INSERT INTO music_analytics.trends_ter_monthly_cube
SELECT
    toStartOfMonth(reporting_period) AS period,
    territory_code,
    isrc,
    sum(quantity_total) AS total_quantity
FROM music_analytics.fact_dsp_comprehensive_report
WHERE source_category IN ('trends', 'usage')
GROUP BY period, territory_code, isrc;
