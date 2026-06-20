-- ============================================================================
-- Migration 022: Fix Decimal revenue conversion in sales cubes
-- Purpose:
--   ClickHouse Decimal / Decimal can produce incorrect scaled values for the
--   current Decimal(38, 18) revenue and exchange-rate columns. Use
--   divideDecimal(..., 18), then rebuild affected sales cubes.
-- ============================================================================

DROP VIEW IF EXISTS music_analytics.sales_dsp_monthly_cube_v2_mv;
DROP VIEW IF EXISTS music_analytics.sales_ter_monthly_cube_v2_mv;
DROP VIEW IF EXISTS music_analytics.sales_export_monthly_cube_mv;

CREATE MATERIALIZED VIEW IF NOT EXISTS music_analytics.sales_dsp_monthly_cube_v2_mv
TO music_analytics.sales_dsp_monthly_cube_v2
AS SELECT
    toStartOfMonth(f.reporting_period_start) AS period,
    f.dsp_id,
    f.isrc,
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
GROUP BY period, f.dsp_id, f.isrc;

CREATE MATERIALIZED VIEW IF NOT EXISTS music_analytics.sales_ter_monthly_cube_v2_mv
TO music_analytics.sales_ter_monthly_cube_v2
AS SELECT
    toStartOfMonth(f.reporting_period_start) AS period,
    f.territory_code,
    f.isrc,
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
GROUP BY period, f.territory_code, f.isrc;

CREATE MATERIALIZED VIEW IF NOT EXISTS music_analytics.sales_export_monthly_cube_mv
TO music_analytics.sales_export_monthly_cube
AS SELECT
    toStartOfMonth(f.reporting_period_start) AS period,
    f.dsp_id,
    f.territory_code,
    f.isrc,
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
LEFT JOIN music_analytics.exchange_rates er
    ON formatDateTime(f.reporting_period_start, '%Y-%m') = er.rate_month
    AND f.revenue_currency = er.currency
GROUP BY period, f.dsp_id, f.territory_code, f.isrc;

TRUNCATE TABLE IF EXISTS music_analytics.sales_dsp_monthly_cube_v2;
TRUNCATE TABLE IF EXISTS music_analytics.sales_ter_monthly_cube_v2;
TRUNCATE TABLE IF EXISTS music_analytics.sales_export_monthly_cube;

INSERT INTO music_analytics.sales_dsp_monthly_cube_v2
SELECT
    toStartOfMonth(f.reporting_period_start) AS period,
    f.dsp_id,
    f.isrc,
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
GROUP BY period, f.dsp_id, f.isrc;

INSERT INTO music_analytics.sales_ter_monthly_cube_v2
SELECT
    toStartOfMonth(f.reporting_period_start) AS period,
    f.territory_code,
    f.isrc,
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
GROUP BY period, f.territory_code, f.isrc;

INSERT INTO music_analytics.sales_export_monthly_cube
SELECT
    toStartOfMonth(f.reporting_period_start) AS period,
    f.dsp_id,
    f.territory_code,
    f.isrc,
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
GROUP BY period, f.dsp_id, f.territory_code, f.isrc;
