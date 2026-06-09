-- ============================================================================
-- Migration 015: Update ISRC and Exchange Rate Column Comments and Rename rate Column
-- Purpose: 
--   1. Drop MV dependencies to allow renaming the 'rate' column.
--   2. Rename column 'rate' to 'usd_to_local_rate' in table 'exchange_rates'.
--   3. Re-create the MV cubes referencing the new 'usd_to_local_rate' column.
--   4. Update comments on the 'isrc' column in all cubes and tables to clarify
--      that ISRCs starting with 'UPC-' represent album-level (UPC) records.
-- ============================================================================

-- 1. Drop dependent materialized views
DROP VIEW IF EXISTS music_analytics.sales_dsp_monthly_cube_v2_mv;
DROP VIEW IF EXISTS music_analytics.sales_ter_monthly_cube_v2_mv;

-- 2. Rename column in exchange_rates
-- ALTER TABLE music_analytics.exchange_rates RENAME COLUMN rate TO usd_to_local_rate;

-- 3. Update 'usd_to_local_rate' column comment
ALTER TABLE music_analytics.exchange_rates COMMENT COLUMN usd_to_local_rate 'Exchange rate relative to USD. Specifically, 1 USD = X Local Currency units (e.g., 1 USD = 25000 VND). To convert local revenue to USD, divide by this rate: revenue_usd = revenue_local / usd_to_local_rate.';

-- 4. Re-create materialized views referencing usd_to_local_rate
CREATE MATERIALIZED VIEW IF NOT EXISTS music_analytics.sales_dsp_monthly_cube_v2_mv
TO music_analytics.sales_dsp_monthly_cube_v2
AS SELECT
    toStartOfMonth(f.reporting_period_start) AS period,
    f.dsp_id,
    f.isrc,
    sum(f.quantity) AS total_quantity,
    sum(f.revenue_local / if(er.usd_to_local_rate > 0, er.usd_to_local_rate, 1)) AS total_revenue_usd
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
    sum(f.revenue_local / if(er.usd_to_local_rate > 0, er.usd_to_local_rate, 1)) AS total_revenue_usd
FROM music_analytics.fact_sales_report f
LEFT JOIN music_analytics.exchange_rates er
    ON formatDateTime(f.reporting_period_start, '%Y-%m') = er.rate_month
    AND f.revenue_currency = er.currency
GROUP BY period, f.territory_code, f.isrc;

-- 5. Update 'isrc' column comments on all tables and cubes
ALTER TABLE music_analytics.fact_dsp_comprehensive_report COMMENT COLUMN isrc 'International Standard Recording Code. If it starts with ''UPC-'', it represents an album-level (UPC) record instead of a track-level ISRC.';
ALTER TABLE music_analytics.fact_sales_report COMMENT COLUMN isrc 'International Standard Recording Code. If it starts with ''UPC-'', it represents an album-level (UPC) record instead of a track-level ISRC.';
ALTER TABLE music_analytics.trends_isrc_daily_cube COMMENT COLUMN isrc 'International Standard Recording Code. If it starts with ''UPC-'', it represents an album-level (UPC) record instead of a track-level ISRC.';
ALTER TABLE music_analytics.trends_dsp_daily_cube COMMENT COLUMN isrc 'International Standard Recording Code. If it starts with ''UPC-'', it represents an album-level (UPC) record instead of a track-level ISRC.';
ALTER TABLE music_analytics.trends_dsp_monthly_cube COMMENT COLUMN isrc 'International Standard Recording Code. If it starts with ''UPC-'', it represents an album-level (UPC) record instead of a track-level ISRC.';
ALTER TABLE music_analytics.trends_ter_monthly_cube COMMENT COLUMN isrc 'International Standard Recording Code. If it starts with ''UPC-'', it represents an album-level (UPC) record instead of a track-level ISRC.';
ALTER TABLE music_analytics.sales_dsp_monthly_cube_v2 COMMENT COLUMN isrc 'International Standard Recording Code. If it starts with ''UPC-'', it represents an album-level (UPC) record instead of a track-level ISRC.';
ALTER TABLE music_analytics.sales_ter_monthly_cube_v2 COMMENT COLUMN isrc 'International Standard Recording Code. If it starts with ''UPC-'', it represents an album-level (UPC) record instead of a track-level ISRC.';
ALTER TABLE music_analytics.pg_tracks_sync COMMENT COLUMN isrc 'International Standard Recording Code. If it starts with ''UPC-'', it represents an album-level (UPC) record instead of a track-level ISRC.';
