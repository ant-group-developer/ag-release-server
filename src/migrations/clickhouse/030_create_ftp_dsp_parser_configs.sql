-- Per-DSP FTP parser and file-selection rules. One logical row per DSP/category.
CREATE TABLE IF NOT EXISTS music_analytics.ftp_dsp_parser_configs (
    dsp_report_id    String,
    source_category  LowCardinality(String),
    parser_code      String,
    include_patterns Array(String) DEFAULT [],
    exclude_patterns Array(String) DEFAULT [],
    field_mappings  String DEFAULT '[]',
    is_active        UInt8 DEFAULT 1,
    description      String DEFAULT '',
    config_version   UInt64 DEFAULT 0,
    created_at       DateTime DEFAULT now(),
    updated_at       DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (dsp_report_id, source_category)
COMMENT 'FTP parser and file regex configuration per DSP report/category';

ALTER TABLE music_analytics.etl_import_history
    ADD COLUMN IF NOT EXISTS parser_config_version UInt64 DEFAULT 0;

ALTER TABLE music_analytics.etl_import_history
    ADD COLUMN IF NOT EXISTS file_manifest Array(String) DEFAULT [];
