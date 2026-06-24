-- ============================================================================
-- Migration 018: Decimal exchange rates and exact revenue cube calculation
-- Purpose:
--   - Store exchange rates as Decimal128(18), not Float64.
--   - Recreate sales cube materialized views using Decimal-only calculation.
--   - Prefer fact_sales_report.revenue_usd when DSP provided official USD;
--     otherwise convert revenue_local / usd_to_local_rate.
-- ============================================================================

DROP VIEW IF EXISTS music_analytics.sales_dsp_monthly_cube_v2_mv;
DROP VIEW IF EXISTS music_analytics.sales_ter_monthly_cube_v2_mv;

ALTER TABLE music_analytics.exchange_rates
  MODIFY COLUMN usd_to_local_rate Decimal128(18)
  COMMENT 'Exchange rate relative to USD. 1 USD = X local currency units. Stored as Decimal128(18) to avoid Float64 precision drift.';

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
