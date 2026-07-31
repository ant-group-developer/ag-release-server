-- Remote-file inventory and admin-owned import rules. Discovery only updates
-- the catalog; rules are preserved independently from future scans.
CREATE TABLE IF NOT EXISTS music_analytics.ftp_report_file_catalog (
    source                  LowCardinality(String),
    source_category         LowCardinality(String),
    dsp_folder              String,
    file_name_pattern       String,
    sample_file_paths       Array(String) DEFAULT [],
    observed_file_count     UInt64 DEFAULT 0,
    observed_period_count   UInt64 DEFAULT 0,
    first_seen_at           DateTime DEFAULT now(),
    last_seen_at            DateTime DEFAULT now(),
    last_scan_id            String DEFAULT '',
    updated_at              DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (source, source_category, dsp_folder, file_name_pattern)
COMMENT 'Discovered remote report-file patterns and observation statistics.';

CREATE TABLE IF NOT EXISTS music_analytics.ftp_report_file_rules (
    id                      String,
    source                  LowCardinality(String),
    source_category         LowCardinality(String),
    dsp_folder_pattern      String,
    file_name_pattern       String,
    status                  LowCardinality(String), -- pending | import | ignore
    parser_code             String DEFAULT '',
    description             String DEFAULT '',
    config_version          UInt64 DEFAULT 1,
    is_active               UInt8 DEFAULT 1,
    created_at              DateTime DEFAULT now(),
    updated_at              DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (id)
COMMENT 'Admin-controlled decisions for discovered report files.';

CREATE TABLE IF NOT EXISTS music_analytics.ftp_report_file_scan_runs (
    id                      String,
    source                  LowCardinality(String),
    status                  LowCardinality(String), -- running | completed | failed
    periods_scanned         UInt64 DEFAULT 0,
    folders_scanned         UInt64 DEFAULT 0,
    files_scanned           UInt64 DEFAULT 0,
    patterns_upserted       UInt64 DEFAULT 0,
    error_message           String DEFAULT '',
    started_at              DateTime DEFAULT now(),
    completed_at            DateTime DEFAULT now(),
    updated_at              DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (id)
COMMENT 'Audit records for FTP report-file discovery runs.';
