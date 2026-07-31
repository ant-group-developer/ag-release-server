-- Incremental FTP discovery state. A non-forced run re-scans only the latest
-- successfully scanned period plus any newer periods; force=1 scans all.
CREATE TABLE IF NOT EXISTS music_analytics.ftp_report_file_discovery_checkpoints (
    source                  LowCardinality(String),
    source_category         LowCardinality(String),
    last_completed_period   String DEFAULT '',
    last_scan_id            String DEFAULT '',
    last_scanned_at         DateTime DEFAULT now(),
    updated_at              DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (source, source_category)
COMMENT 'Per-category progress checkpoint for incremental FTP report-file discovery.';

-- Keep each discovered pattern's counts per remote period. This makes an
-- incremental scan idempotent: re-scanning the current period replaces that
-- period's observation instead of adding the same files to the total again.
CREATE TABLE IF NOT EXISTS music_analytics.ftp_report_file_period_observations (
    source                  LowCardinality(String),
    source_category         LowCardinality(String),
    dsp_folder              String,
    file_name_pattern       String,
    period                  String,
    sample_file_paths       Array(String) DEFAULT [],
    observed_file_count     UInt64 DEFAULT 0,
    first_seen_at           DateTime DEFAULT now(),
    last_seen_at            DateTime DEFAULT now(),
    last_scan_id            String DEFAULT '',
    updated_at              DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (source, source_category, dsp_folder, file_name_pattern, period)
COMMENT 'Per-period remote-file observations used to build the FTP discovery catalog.';

ALTER TABLE music_analytics.ftp_report_file_scan_runs
    ADD COLUMN IF NOT EXISTS force UInt8 DEFAULT 0 AFTER source;

ALTER TABLE music_analytics.ftp_report_file_scan_runs
    ADD COLUMN IF NOT EXISTS source_categories Array(String) DEFAULT [] AFTER force;

ALTER TABLE music_analytics.ftp_report_file_discovery_config
    ADD COLUMN IF NOT EXISTS force UInt8 DEFAULT 0 AFTER is_enabled;

ALTER TABLE music_analytics.ftp_report_file_discovery_config
    ADD COLUMN IF NOT EXISTS source_categories Array(String) DEFAULT [] AFTER force;
