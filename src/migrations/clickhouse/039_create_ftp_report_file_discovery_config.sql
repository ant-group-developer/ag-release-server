CREATE TABLE IF NOT EXISTS music_analytics.ftp_report_file_discovery_config (
    id          String,
    cron         String,
    is_enabled  UInt8 DEFAULT 1,
    updated_at  DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (id)
COMMENT 'Singleton runtime configuration for FTP report-file discovery.';

INSERT INTO music_analytics.ftp_report_file_discovery_config
    (id, cron, is_enabled, updated_at)
SELECT 'default', '0 1 * * *', 1, now()
WHERE NOT EXISTS (
    SELECT 1 FROM music_analytics.ftp_report_file_discovery_config FINAL WHERE id = 'default'
);
