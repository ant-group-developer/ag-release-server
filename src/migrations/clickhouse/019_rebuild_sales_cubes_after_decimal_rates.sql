-- ============================================================================
-- Migration 019: Rebuild sales cubes after Decimal exchange-rate migration
-- Purpose:
--   Migration 018 changes the MV formula and exchange-rate precision, but it
--   does not recalculate rows already stored in the cube tables. This migration
--   rebuilds both sales cubes from fact_sales_report + exchange_rates.
-- ============================================================================

TRUNCATE TABLE IF EXISTS music_analytics.sales_dsp_monthly_cube_v2;

TRUNCATE TABLE IF EXISTS music_analytics.sales_ter_monthly_cube_v2;

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
