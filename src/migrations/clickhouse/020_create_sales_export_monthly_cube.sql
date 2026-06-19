-- ============================================================================
-- Migration 020: Sales export monthly cube
-- Purpose:
--   Export reports need DSP + Territory + ISRC + Month in the same grain.
--   Existing sales_dsp_monthly_cube_v2 misses territory_code, while
--   sales_ter_monthly_cube_v2 misses dsp_id.
-- ============================================================================

CREATE TABLE IF NOT EXISTS music_analytics.sales_export_monthly_cube
(
    period              Date,
    dsp_id              LowCardinality(String),
    territory_code      LowCardinality(String),
    isrc                String COMMENT 'International Standard Recording Code. If it starts with ''UPC-'', it represents an album-level (UPC) record instead of a track-level ISRC.',

    upc                 String DEFAULT '',
    track_title         String DEFAULT '',
    album_title         String DEFAULT '',
    artist_name         String DEFAULT '',
    label_name          String DEFAULT '',

    total_usage         UInt64,
    revenue_usd         Decimal128(18)
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(period)
ORDER BY (period, isrc, dsp_id, territory_code)
COMMENT 'Pre-aggregated sales export grain by month + ISRC + DSP + territory';

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
        f.revenue_local / if(
          toDecimal128OrDefault(toString(er.usd_to_local_rate), 18, toDecimal128(1, 18)) > 0,
          toDecimal128OrDefault(toString(er.usd_to_local_rate), 18, toDecimal128(1, 18)),
          toDecimal128(1, 18)
        )
      )
    ) AS revenue_usd
FROM music_analytics.fact_sales_report f
LEFT JOIN music_analytics.exchange_rates er
    ON formatDateTime(f.reporting_period_start, '%Y-%m') = er.rate_month
    AND f.revenue_currency = er.currency
GROUP BY period, f.dsp_id, f.territory_code, f.isrc;

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
        f.revenue_local / if(
          toDecimal128OrDefault(toString(er.usd_to_local_rate), 18, toDecimal128(1, 18)) > 0,
          toDecimal128OrDefault(toString(er.usd_to_local_rate), 18, toDecimal128(1, 18)),
          toDecimal128(1, 18)
        )
      )
    ) AS revenue_usd
FROM music_analytics.fact_sales_report f
LEFT JOIN (SELECT * FROM music_analytics.exchange_rates FINAL) er
    ON formatDateTime(f.reporting_period_start, '%Y-%m') = er.rate_month
    AND f.revenue_currency = er.currency
GROUP BY period, f.dsp_id, f.territory_code, f.isrc;
