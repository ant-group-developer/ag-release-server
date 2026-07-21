-- Executable field mappings are stored as structured rows instead of JSON blobs.
-- A config version owns a full mapping snapshot, so an import can always resolve
-- the same mapping version that triggered it.
CREATE TABLE IF NOT EXISTS music_analytics.ftp_parser_field_mappings (
    mapping_scope    LowCardinality(String), -- catalog | parser_override | legacy dsp_config
    dsp_report_id    String DEFAULT '',
    parser_code      String,
    source_category  LowCardinality(String),
    config_version   UInt64 DEFAULT 0,
    mapping_key      String,
    report_column    String,
    parser_column    String DEFAULT '',
    target_column    String,
    transform        String DEFAULT 'trim',
    is_active        UInt8 DEFAULT 1,
    updated_at       DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (
    mapping_scope,
    dsp_report_id,
    parser_code,
    source_category,
    config_version,
    mapping_key
)
COMMENT 'Structured parser field mappings. Catalog rows document defaults and parser_override rows are user-managed snapshots.';

-- Preserve existing user-managed config mappings before removing the JSON field.
INSERT INTO music_analytics.ftp_parser_field_mappings
    (mapping_scope, dsp_report_id, parser_code, source_category, config_version,
     mapping_key, report_column, parser_column, target_column, transform, is_active, updated_at)
SELECT
    'dsp_config',
    dsp_report_id,
    parser_code,
    source_category,
    config_version,
    concat('target:', JSONExtractString(mapping, 'targetColumn')),
    JSONExtractString(mapping, 'reportColumn'),
    '',
    JSONExtractString(mapping, 'targetColumn'),
    if(JSONExtractString(mapping, 'transform') = '', 'trim', JSONExtractString(mapping, 'transform')),
    1,
    updated_at
FROM music_analytics.ftp_dsp_parser_configs FINAL
ARRAY JOIN JSONExtractArrayRaw(field_mappings) AS mapping
WHERE field_mappings != '' AND field_mappings != '[]';

-- Preserve catalog mappings for the read-only parser catalog API.
INSERT INTO music_analytics.ftp_parser_field_mappings
    (mapping_scope, dsp_report_id, parser_code, source_category, config_version,
     mapping_key, report_column, parser_column, target_column, transform, is_active, updated_at)
SELECT
    'catalog',
    '',
    parser_code,
    source_category,
    0,
    concat('target:', JSONExtractString(mapping, 'targetColumn'), ':source:', JSONExtractString(mapping, 'reportColumn')),
    JSONExtractString(mapping, 'reportColumn'),
    JSONExtractString(mapping, 'reportColumn'),
    JSONExtractString(mapping, 'targetColumn'),
    if(JSONExtractString(mapping, 'transform') = '', 'trim', JSONExtractString(mapping, 'transform')),
    1,
    synced_at
FROM music_analytics.ftp_parser_catalog FINAL
ARRAY JOIN JSONExtractArrayRaw(field_mappings) AS mapping
WHERE field_mappings != '' AND field_mappings != '[]';

ALTER TABLE music_analytics.ftp_dsp_parser_configs
    DROP COLUMN IF EXISTS field_mappings;

ALTER TABLE music_analytics.ftp_parser_catalog
    DROP COLUMN IF EXISTS field_mappings;
