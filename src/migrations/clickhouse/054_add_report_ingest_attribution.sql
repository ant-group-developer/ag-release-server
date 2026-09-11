-- Preserve the tenant/label chosen at report upload time. Ownership history
-- remains authoritative for identified assets; these columns are the safe
-- fallback for rows such as Audio Salad records whose ISRC and UPC are N/A.

ALTER TABLE music_analytics.fact_sales_report
    ADD COLUMN IF NOT EXISTS ingest_tenant_id String DEFAULT '' AFTER source_file_name;

ALTER TABLE music_analytics.fact_sales_report
    ADD COLUMN IF NOT EXISTS ingest_label_id String DEFAULT '' AFTER ingest_tenant_id;

DROP TABLE IF EXISTS music_analytics.sales_dsp_monthly_cube_v2;

CREATE TABLE music_analytics.sales_dsp_monthly_cube_v2
(
    period              Date,
    dsp_id              LowCardinality(String),
    isrc                String,
    import_source       LowCardinality(String) DEFAULT '',
    ingest_tenant_id    String DEFAULT '',
    ingest_label_id     String DEFAULT '',
    total_quantity      UInt64,
    total_revenue_usd   Decimal128(18)
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(period)
ORDER BY (isrc, dsp_id, period, import_source, ingest_tenant_id, ingest_label_id);

INSERT INTO music_analytics.sales_dsp_monthly_cube_v2
SELECT
    toStartOfMonth(f.reporting_period_start) AS period,
    f.dsp_id,
    f.isrc,
    if(f.import_source = '', 'ftp', f.import_source) AS import_source,
    f.ingest_tenant_id,
    f.ingest_label_id,
    sum(f.quantity) AS total_quantity,
    sum(if(
        f.revenue_usd != 0,
        f.revenue_usd,
        divideDecimal(f.revenue_local, if(
            toDecimal128OrDefault(toString(er.usd_to_local_rate), 18, toDecimal128(1, 18)) > 0,
            toDecimal128OrDefault(toString(er.usd_to_local_rate), 18, toDecimal128(1, 18)),
            toDecimal128(1, 18)
        ), 18)
    )) AS total_revenue_usd
FROM music_analytics.fact_sales_report f
LEFT JOIN (SELECT * FROM music_analytics.exchange_rates FINAL) er
    ON formatDateTime(f.reporting_period_start, '%Y-%m') = er.rate_month
   AND f.revenue_currency = er.currency
GROUP BY period, f.dsp_id, f.isrc, import_source, f.ingest_tenant_id, f.ingest_label_id;

DROP TABLE IF EXISTS music_analytics.sales_ter_monthly_cube_v2;

CREATE TABLE music_analytics.sales_ter_monthly_cube_v2
(
    period              Date,
    territory_code      LowCardinality(String),
    dsp_id              LowCardinality(String),
    isrc                String,
    import_source       LowCardinality(String) DEFAULT '',
    ingest_tenant_id    String DEFAULT '',
    ingest_label_id     String DEFAULT '',
    total_quantity      UInt64,
    total_revenue_usd   Decimal128(18)
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(period)
ORDER BY (isrc, territory_code, dsp_id, period, import_source, ingest_tenant_id, ingest_label_id);

INSERT INTO music_analytics.sales_ter_monthly_cube_v2
SELECT
    toStartOfMonth(f.reporting_period_start) AS period,
    f.territory_code,
    f.dsp_id,
    f.isrc,
    if(f.import_source = '', 'ftp', f.import_source) AS import_source,
    f.ingest_tenant_id,
    f.ingest_label_id,
    sum(f.quantity) AS total_quantity,
    sum(if(
        f.revenue_usd != 0,
        f.revenue_usd,
        divideDecimal(f.revenue_local, if(
            toDecimal128OrDefault(toString(er.usd_to_local_rate), 18, toDecimal128(1, 18)) > 0,
            toDecimal128OrDefault(toString(er.usd_to_local_rate), 18, toDecimal128(1, 18)),
            toDecimal128(1, 18)
        ), 18)
    )) AS total_revenue_usd
FROM music_analytics.fact_sales_report f
LEFT JOIN (SELECT * FROM music_analytics.exchange_rates FINAL) er
    ON formatDateTime(f.reporting_period_start, '%Y-%m') = er.rate_month
   AND f.revenue_currency = er.currency
GROUP BY period, f.territory_code, f.dsp_id, f.isrc, import_source, f.ingest_tenant_id, f.ingest_label_id;

DROP TABLE IF EXISTS music_analytics.sales_export_monthly_cube;

CREATE TABLE music_analytics.sales_export_monthly_cube
(
    period              Date,
    dsp_id              LowCardinality(String),
    territory_code      LowCardinality(String),
    isrc                String,
    import_source       LowCardinality(String) DEFAULT '',
    ingest_tenant_id    String DEFAULT '',
    ingest_label_id     String DEFAULT '',
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
ORDER BY (period, isrc, dsp_id, territory_code, import_source, ingest_tenant_id, ingest_label_id);

INSERT INTO music_analytics.sales_export_monthly_cube
SELECT
    toStartOfMonth(f.reporting_period_start) AS period,
    f.dsp_id,
    f.territory_code,
    f.isrc,
    if(f.import_source = '', 'ftp', f.import_source) AS import_source,
    f.ingest_tenant_id,
    f.ingest_label_id,
    any(f.upc) AS upc,
    any(f.track_title) AS track_title,
    any(f.album_title) AS album_title,
    any(f.artist_name) AS artist_name,
    any(f.label_name) AS label_name,
    sum(f.quantity) AS total_usage,
    sum(if(
        f.revenue_usd != 0,
        f.revenue_usd,
        divideDecimal(f.revenue_local, if(
            toDecimal128OrDefault(toString(er.usd_to_local_rate), 18, toDecimal128(1, 18)) > 0,
            toDecimal128OrDefault(toString(er.usd_to_local_rate), 18, toDecimal128(1, 18)),
            toDecimal128(1, 18)
        ), 18)
    )) AS revenue_usd
FROM music_analytics.fact_sales_report f
LEFT JOIN (SELECT * FROM music_analytics.exchange_rates FINAL) er
    ON formatDateTime(f.reporting_period_start, '%Y-%m') = er.rate_month
   AND f.revenue_currency = er.currency
GROUP BY period, f.dsp_id, f.territory_code, f.isrc, import_source, f.ingest_tenant_id, f.ingest_label_id;

INSERT INTO music_analytics.analytics_source_type_configs
    (source_type, label, image_url, is_active, config_version)
VALUES ('audio_salad_report', 'Audio Salad', NULL, 1, 2);
