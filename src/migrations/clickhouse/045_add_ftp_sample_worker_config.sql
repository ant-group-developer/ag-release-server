-- Sample-download worker knobs. The worker used to poll every 5s with no backoff,
-- so a batch that failed against a throttling FTP server was retried immediately,
-- which kept the server throttling. These make the cadence tunable at runtime.
ALTER TABLE music_analytics.ftp_report_file_discovery_config
    ADD COLUMN IF NOT EXISTS sample_worker_interval_ms UInt32 DEFAULT 30000 AFTER source_categories;

ALTER TABLE music_analytics.ftp_report_file_discovery_config
    ADD COLUMN IF NOT EXISTS sample_worker_batch_size UInt8 DEFAULT 2 AFTER sample_worker_interval_ms;

ALTER TABLE music_analytics.ftp_report_file_discovery_config
    ADD COLUMN IF NOT EXISTS sample_worker_max_attempts UInt8 DEFAULT 3 AFTER sample_worker_batch_size;

ALTER TABLE music_analytics.ftp_report_file_discovery_config
    ADD COLUMN IF NOT EXISTS sample_worker_retry_backoff_ms UInt32 DEFAULT 60000 AFTER sample_worker_max_attempts;
