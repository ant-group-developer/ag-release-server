-- Demographics cube for Vevo device/gender/age breakdowns + social interactions.
-- Source rows (fact_dsp_comprehensive_report, Vevo parser only):
--   usage_type='view' + metadata['sub_type']='devices'   → device breakdown (quantity_total = views)
--   usage_type='view_demo'                               → gender/age breakdown (views_estimate in metadata)
--   usage_type='view_social'                             → likes/dislikes/shares (metadata)
-- Demo/social rows carry quantity_total=0 so existing cubes are unaffected.
-- Tenant scoping is resolved at query time via the ownership join (no tenant columns here),
-- matching the convention of trends_ter_daily_cube (migration 036).
CREATE TABLE IF NOT EXISTS music_analytics.trends_demographics_cube
(
    reporting_date      Date,
    isrc                String,
    import_source       LowCardinality(String) DEFAULT '',
    dimension           LowCardinality(String),
    dimension_value     LowCardinality(String),
    territory_code      LowCardinality(String) DEFAULT 'XX',
    views               UInt64 DEFAULT 0,
    likes               UInt64 DEFAULT 0,
    dislikes            UInt64 DEFAULT 0,
    shares              UInt64 DEFAULT 0
)
ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(reporting_date)
ORDER BY (isrc, reporting_date, dimension, dimension_value, territory_code, import_source)
COMMENT 'Pre-aggregated Vevo demographics (device/gender/age) + social interactions by ISRC + day';

CREATE MATERIALIZED VIEW IF NOT EXISTS music_analytics.trends_demographics_cube_mv
TO music_analytics.trends_demographics_cube
AS SELECT
    reporting_date,
    isrc,
    import_source,
    dimension,
    dimension_value,
    territory_code,
    sum(views) AS views,
    sum(likes) AS likes,
    sum(dislikes) AS dislikes,
    sum(shares) AS shares
FROM (
    SELECT
        reporting_period AS reporting_date,
        isrc,
        if(import_source = '', 'ftp', import_source) AS import_source,
        'device' AS dimension,
        metadata['device'] AS dimension_value,
        territory_code,
        quantity_total AS views,
        0 AS likes,
        0 AS dislikes,
        0 AS shares
    FROM music_analytics.fact_dsp_comprehensive_report
    WHERE usage_type = 'view'
      AND metadata['sub_type'] = 'devices'
      AND metadata['device'] != ''

    UNION ALL

    SELECT
        reporting_period AS reporting_date,
        isrc,
        if(import_source = '', 'ftp', import_source) AS import_source,
        'gender' AS dimension,
        metadata['gender'] AS dimension_value,
        territory_code,
        toUInt64OrZero(metadata['views_estimate']) AS views,
        0 AS likes,
        0 AS dislikes,
        0 AS shares
    FROM music_analytics.fact_dsp_comprehensive_report
    WHERE usage_type = 'view_demo'
      AND metadata['gender'] != ''

    UNION ALL

    SELECT
        reporting_period AS reporting_date,
        isrc,
        if(import_source = '', 'ftp', import_source) AS import_source,
        'age_group' AS dimension,
        metadata['age_group'] AS dimension_value,
        territory_code,
        toUInt64OrZero(metadata['views_estimate']) AS views,
        0 AS likes,
        0 AS dislikes,
        0 AS shares
    FROM music_analytics.fact_dsp_comprehensive_report
    WHERE usage_type = 'view_demo'
      AND metadata['age_group'] != ''

    UNION ALL

    SELECT
        reporting_period AS reporting_date,
        isrc,
        if(import_source = '', 'ftp', import_source) AS import_source,
        'social' AS dimension,
        '' AS dimension_value,
        territory_code,
        toUInt64OrZero(metadata['views']) AS views,
        toUInt64OrZero(metadata['likes']) AS likes,
        toUInt64OrZero(metadata['dislikes']) AS dislikes,
        toUInt64OrZero(metadata['shares']) AS shares
    FROM music_analytics.fact_dsp_comprehensive_report
    WHERE usage_type = 'view_social'
)
GROUP BY reporting_date, isrc, import_source, dimension, dimension_value, territory_code;

-- Backfill historical rows already in the fact table (MV only fires for new inserts).
INSERT INTO music_analytics.trends_demographics_cube
SELECT
    reporting_date,
    isrc,
    import_source,
    dimension,
    dimension_value,
    territory_code,
    sum(views) AS views,
    sum(likes) AS likes,
    sum(dislikes) AS dislikes,
    sum(shares) AS shares
FROM (
    SELECT
        reporting_period AS reporting_date,
        isrc,
        if(import_source = '', 'ftp', import_source) AS import_source,
        'device' AS dimension,
        metadata['device'] AS dimension_value,
        territory_code,
        quantity_total AS views,
        0 AS likes,
        0 AS dislikes,
        0 AS shares
    FROM music_analytics.fact_dsp_comprehensive_report
    WHERE usage_type = 'view'
      AND metadata['sub_type'] = 'devices'
      AND metadata['device'] != ''

    UNION ALL

    SELECT
        reporting_period AS reporting_date,
        isrc,
        if(import_source = '', 'ftp', import_source) AS import_source,
        'gender' AS dimension,
        metadata['gender'] AS dimension_value,
        territory_code,
        toUInt64OrZero(metadata['views_estimate']) AS views,
        0 AS likes,
        0 AS dislikes,
        0 AS shares
    FROM music_analytics.fact_dsp_comprehensive_report
    WHERE usage_type = 'view_demo'
      AND metadata['gender'] != ''

    UNION ALL

    SELECT
        reporting_period AS reporting_date,
        isrc,
        if(import_source = '', 'ftp', import_source) AS import_source,
        'age_group' AS dimension,
        metadata['age_group'] AS dimension_value,
        territory_code,
        toUInt64OrZero(metadata['views_estimate']) AS views,
        0 AS likes,
        0 AS dislikes,
        0 AS shares
    FROM music_analytics.fact_dsp_comprehensive_report
    WHERE usage_type = 'view_demo'
      AND metadata['age_group'] != ''

    UNION ALL

    SELECT
        reporting_period AS reporting_date,
        isrc,
        if(import_source = '', 'ftp', import_source) AS import_source,
        'social' AS dimension,
        '' AS dimension_value,
        territory_code,
        toUInt64OrZero(metadata['views']) AS views,
        toUInt64OrZero(metadata['likes']) AS likes,
        toUInt64OrZero(metadata['dislikes']) AS dislikes,
        toUInt64OrZero(metadata['shares']) AS shares
    FROM music_analytics.fact_dsp_comprehensive_report
    WHERE usage_type = 'view_social'
)
GROUP BY reporting_date, isrc, import_source, dimension, dimension_value, territory_code;
