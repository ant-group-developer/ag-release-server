-- Daily territory trend cube for exact date-range line and bar chart queries.
CREATE TABLE IF NOT EXISTS music_analytics.trends_ter_daily_cube
(
    reporting_date      Date,
    territory_code      LowCardinality(String),
    dsp_id              LowCardinality(String),
    isrc                String,
    import_source       LowCardinality(String) DEFAULT '',
    total_quantity      UInt64,
    total_unique_users  UInt64
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(reporting_date)
ORDER BY (reporting_date, territory_code, dsp_id, isrc, import_source)
COMMENT 'Pre-aggregated trends data by territory + DSP + ISRC + day + import_source';

CREATE MATERIALIZED VIEW IF NOT EXISTS music_analytics.trends_ter_daily_cube_mv
TO music_analytics.trends_ter_daily_cube
AS SELECT
    reporting_period AS reporting_date,
    territory_code,
    dsp_id,
    isrc,
    if(import_source = '', 'ftp', import_source) AS import_source,
    sum(quantity_total) AS total_quantity,
    sum(quantity_unique_users) AS total_unique_users
FROM music_analytics.fact_dsp_comprehensive_report
GROUP BY reporting_date, territory_code, dsp_id, isrc, import_source;

INSERT INTO music_analytics.trends_ter_daily_cube
SELECT
    reporting_period AS reporting_date,
    territory_code,
    dsp_id,
    isrc,
    if(import_source = '', 'ftp', import_source) AS import_source,
    sum(quantity_total) AS total_quantity,
    sum(quantity_unique_users) AS total_unique_users
FROM music_analytics.fact_dsp_comprehensive_report
GROUP BY reporting_date, territory_code, dsp_id, isrc, import_source;
