ALTER TABLE music_analytics.ftp_report_file_period_observations
    ADD COLUMN IF NOT EXISTS sample_file_refs Array(String) DEFAULT [] AFTER sample_file_keys;

ALTER TABLE music_analytics.ftp_report_file_catalog
    ADD COLUMN IF NOT EXISTS sample_file_refs Array(String) DEFAULT [] AFTER sample_file_keys;
