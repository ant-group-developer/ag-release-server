-- Migration: Add View for DSP Cube Integration
-- Purpose: Create views for JOIN-based DSP name lookup in cubes (simpler than Dictionary)

-- 1. Create view for sales_dsp_monthly_cube with DSP name
-- This view joins cube with DSP tables to get dsp_name for query
CREATE VIEW IF NOT EXISTS music_analytics.v_sales_dsp_monthly AS
SELECT
    s.period,
    s.dsp_id,
    r.dsp_name as dsp_name,
    r.pg_uuid as pg_uuid,
    p.dsp_name as pg_dsp_name,
    p.dsp_code as pg_dsp_code,
    s.total_quantity
FROM music_analytics.sales_dsp_monthly_cube s
LEFT JOIN music_analytics.dsps_report r ON s.dsp_id = r.id_dsps_report
LEFT JOIN music_analytics.pg_dsps_sync p ON r.pg_uuid = p.pg_uuid;

-- 2. Create view for trends_dsp_daily_cube with DSP name
CREATE VIEW IF NOT EXISTS music_analytics.v_trends_dsp_daily AS
SELECT
    t.reporting_date as period,
    t.dsp_id,
    r.dsp_name as dsp_name,
    r.pg_uuid as pg_uuid,
    p.dsp_name as pg_dsp_name,
    p.dsp_code as pg_dsp_code,
    t.total_quantity
FROM music_analytics.trends_dsp_daily_cube t
LEFT JOIN music_analytics.dsps_report r ON t.dsp_id = r.id_dsps_report
LEFT JOIN music_analytics.pg_dsps_sync p ON r.pg_uuid = p.pg_uuid;

-- 3. Create view for trends_dsp_monthly_cube with DSP name
CREATE VIEW IF NOT EXISTS music_analytics.v_trends_dsp_monthly AS
SELECT
    t.period,
    t.dsp_id,
    r.dsp_name as dsp_name,
    r.pg_uuid as pg_uuid,
    p.dsp_name as pg_dsp_name,
    p.dsp_code as pg_dsp_code,
    t.total_quantity
FROM music_analytics.trends_dsp_monthly_cube t
LEFT JOIN music_analytics.dsps_report r ON t.dsp_id = r.id_dsps_report
LEFT JOIN music_analytics.pg_dsps_sync p ON r.pg_uuid = p.pg_uuid;
