-- 1. Create table for code configs sync
CREATE TABLE IF NOT EXISTS music_analytics.report_source_configs (
    id                String,
    source_code       LowCardinality(String),
    source_name       String,
    report_type       LowCardinality(String),
    folder_patterns   Array(String),
    file_patterns     Array(String),
    required_headers  Array(String),
    parser_code       String,
    delimiter         String DEFAULT ',',
    default_currency  String DEFAULT 'USD',
    default_member    String DEFAULT '',
    priority          UInt16 DEFAULT 100,
    is_active         UInt8 DEFAULT 1,
    created_at        DateTime DEFAULT now(),
    updated_at        DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY id;

-- 2. Add audit columns to fact_sales_report
ALTER TABLE music_analytics.fact_sales_report
  ADD COLUMN IF NOT EXISTS import_source LowCardinality(String) DEFAULT '' COMMENT 'Source category: ftp | wmg_report | ...',
  ADD COLUMN IF NOT EXISTS source_file_name String DEFAULT '' COMMENT 'Original file name that produced this row';

-- 3. Add audit columns to fact_dsp_comprehensive_report
ALTER TABLE music_analytics.fact_dsp_comprehensive_report
  ADD COLUMN IF NOT EXISTS import_source LowCardinality(String) DEFAULT '' COMMENT 'Source category: ftp | wmg_report | ...',
  ADD COLUMN IF NOT EXISTS source_file_name String DEFAULT '' COMMENT 'Original file name that produced this row';
