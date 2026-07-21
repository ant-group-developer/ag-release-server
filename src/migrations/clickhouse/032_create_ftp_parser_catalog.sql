CREATE TABLE IF NOT EXISTS music_analytics.ftp_parser_catalog (
    parser_code     String,
    source_category LowCardinality(String),
    parser_name     String,
    source_file     String,
    target_table    String,
    field_mappings  String DEFAULT '[]',
    parser_source   String,
    source_hash     FixedString(64),
    is_selectable   UInt8 DEFAULT 0,
    is_active       UInt8 DEFAULT 1,
    synced_at       DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree(synced_at)
ORDER BY (parser_code, source_category)
COMMENT 'Catalog generated from the ETL parser source files';
