-- Migration 055: Exact statement-currency sales export cube
--
-- This projection intentionally preserves the amount and currency imported into
-- fact_sales_report. It is separate from sales_export_monthly_cube, whose
-- revenue_usd column is normalized to USD for analytics use.

DROP TABLE IF EXISTS music_analytics.sales_statement_monthly_cube;

CREATE TABLE music_analytics.sales_statement_monthly_cube
(
    period              Date,
    dsp_id              LowCardinality(String),
    territory_code      LowCardinality(String),
    isrc                String,
    import_source       LowCardinality(String) DEFAULT '',
    ingest_tenant_id    String DEFAULT '',
    ingest_label_id     String DEFAULT '',
    revenue_currency    LowCardinality(String) DEFAULT 'USD',
    upc                 String DEFAULT '',
    track_title         String DEFAULT '',
    album_title         String DEFAULT '',
    artist_name         String DEFAULT '',
    label_name          String DEFAULT '',
    total_usage         UInt64,
    revenue_local       Decimal128(18),
    revenue_usd         Decimal128(18)
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(period)
ORDER BY (
    period,
    isrc,
    dsp_id,
    territory_code,
    import_source,
    ingest_tenant_id,
    ingest_label_id,
    revenue_currency
)
COMMENT 'Pre-aggregated sales export grain preserving imported amount and statement currency';

INSERT INTO music_analytics.sales_statement_monthly_cube
SELECT
    toStartOfMonth(f.reporting_period_start) AS period,
    f.dsp_id,
    f.territory_code,
    f.isrc,
    if(f.import_source = '', 'ftp', f.import_source) AS import_source,
    f.ingest_tenant_id,
    f.ingest_label_id,
    if(f.revenue_currency = '', 'USD', f.revenue_currency) AS revenue_currency,
    any(f.upc) AS upc,
    any(f.track_title) AS track_title,
    any(f.album_title) AS album_title,
    any(f.artist_name) AS artist_name,
    any(f.label_name) AS label_name,
    sum(f.quantity) AS total_usage,
    sum(
        if(
            f.revenue_local != 0 OR f.revenue_usd = 0,
            f.revenue_local,
            f.revenue_usd
        )
    ) AS revenue_local,
    sum(f.revenue_usd) AS revenue_usd
FROM music_analytics.fact_sales_report f
GROUP BY
    period,
    f.dsp_id,
    f.territory_code,
    f.isrc,
    import_source,
    f.ingest_tenant_id,
    f.ingest_label_id,
    revenue_currency;
