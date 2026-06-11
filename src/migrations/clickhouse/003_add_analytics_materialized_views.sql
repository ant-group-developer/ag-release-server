-- ============================================================================
-- Migration 003: Add Analytics Materialized Views
-- ============================================================================
-- Creates pre-aggregated materialized views for analytics queries:
--   1. sales_dsp_monthly_cube    - DSP Timeline API (from fact_sales_report)
--   2. trends_isrc_daily_cube    - Rankings (from fact_dsp_comprehensive_report)
--   3. trends_dsp_daily_cube     - Rankings filtered by DSP (from fact_dsp_comprehensive_report)
--
-- Each MV section includes:
--   - Target table (SummingMergeTree engine)
--   - Materialized View definition (auto-populates on INSERT)
--   - Backfill INSERT for existing data
-- ============================================================================


-- ============================================================================
-- MV 1: sales_dsp_monthly_cube
-- Purpose: Pre-aggregated sales data by DSP + ISRC + month for DSP timeline analytics
-- Source:  fact_sales_report
-- ============================================================================

-- Target table for MV
CREATE TABLE IF NOT EXISTS music_analytics.sales_dsp_monthly_cube
(
    period          Date,
    dsp_id          LowCardinality(String),
    isrc            String,
    total_quantity  UInt64
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(period)
ORDER BY (isrc, dsp_id, period)
COMMENT 'Pre-aggregated sales data by DSP + ISRC + month for DSP timeline analytics';

-- MV that auto-populates from fact_sales_report
CREATE MATERIALIZED VIEW IF NOT EXISTS music_analytics.sales_dsp_monthly_cube_mv
TO music_analytics.sales_dsp_monthly_cube
AS SELECT
    toStartOfMonth(reporting_period_start) AS period,
    dsp_id,
    isrc,
    sum(quantity) AS total_quantity
FROM music_analytics.fact_sales_report
GROUP BY period, dsp_id, isrc;

-- Backfill existing data
INSERT INTO music_analytics.sales_dsp_monthly_cube
SELECT
    toStartOfMonth(reporting_period_start) AS period,
    dsp_id,
    isrc,
    sum(quantity) AS total_quantity
FROM music_analytics.fact_sales_report
GROUP BY period, dsp_id, isrc;


-- ============================================================================
-- MV 2: trends_isrc_daily_cube
-- Purpose: Pre-aggregated trends data by ISRC + day for ranking analytics
-- Source:  fact_dsp_comprehensive_report
-- ============================================================================

-- Target table for MV
CREATE TABLE IF NOT EXISTS music_analytics.trends_isrc_daily_cube
(
    reporting_date      Date,
    isrc                String                  COMMENT 'International Standard Recording Code. If it starts with ''UPC-'', it represents an album-level (UPC) record instead of a track-level ISRC.',
    total_quantity      UInt64,
    total_unique_users  UInt64
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(reporting_date)
ORDER BY (isrc, reporting_date)
COMMENT 'Pre-aggregated trends data by ISRC + day for ranking analytics';

-- MV that auto-populates from fact_dsp_comprehensive_report
CREATE MATERIALIZED VIEW IF NOT EXISTS music_analytics.trends_isrc_daily_cube_mv
TO music_analytics.trends_isrc_daily_cube
AS SELECT
    reporting_period AS reporting_date,
    isrc,
    sum(quantity_total) AS total_quantity,
    sum(quantity_unique_users) AS total_unique_users
FROM music_analytics.fact_dsp_comprehensive_report
GROUP BY reporting_date, isrc;

-- Backfill existing data
INSERT INTO music_analytics.trends_isrc_daily_cube
SELECT
    reporting_period AS reporting_date,
    isrc,
    sum(quantity_total) AS total_quantity,
    sum(quantity_unique_users) AS total_unique_users
FROM music_analytics.fact_dsp_comprehensive_report
GROUP BY reporting_date, isrc;


-- ============================================================================
-- MV 3: trends_dsp_daily_cube
-- Purpose: Pre-aggregated trends data by ISRC + DSP + day for DSP-filtered ranking analytics
-- Source:  fact_dsp_comprehensive_report
-- ============================================================================

-- Target table for MV
CREATE TABLE IF NOT EXISTS music_analytics.trends_dsp_daily_cube
(
    reporting_date      Date,
    dsp_id              LowCardinality(String),
    isrc                String                  COMMENT 'International Standard Recording Code. If it starts with ''UPC-'', it represents an album-level (UPC) record instead of a track-level ISRC.',
    total_quantity      UInt64,
    total_unique_users  UInt64
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(reporting_date)
ORDER BY (isrc, dsp_id, reporting_date)
COMMENT 'Pre-aggregated trends data by ISRC + DSP + day for DSP-filtered ranking analytics';

-- MV that auto-populates from fact_dsp_comprehensive_report
CREATE MATERIALIZED VIEW IF NOT EXISTS music_analytics.trends_dsp_daily_cube_mv
TO music_analytics.trends_dsp_daily_cube
AS SELECT
    reporting_period AS reporting_date,
    dsp_id,
    isrc,
    sum(quantity_total) AS total_quantity,
    sum(quantity_unique_users) AS total_unique_users
FROM music_analytics.fact_dsp_comprehensive_report
GROUP BY reporting_date, dsp_id, isrc;

-- Backfill existing data
INSERT INTO music_analytics.trends_dsp_daily_cube
SELECT
    reporting_period AS reporting_date,
    dsp_id,
    isrc,
    sum(quantity_total) AS total_quantity,
    sum(quantity_unique_users) AS total_unique_users
FROM music_analytics.fact_dsp_comprehensive_report
GROUP BY reporting_date, dsp_id, isrc;
