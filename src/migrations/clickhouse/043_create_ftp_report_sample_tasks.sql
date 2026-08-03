CREATE TABLE IF NOT EXISTS music_analytics.ftp_report_sample_tasks (
    id String, source LowCardinality(String), source_category LowCardinality(String), dsp_folder String,
    file_name_pattern String, period String, ftp_path String, status LowCardinality(String),
    attempt UInt8 DEFAULT 0, error_message String DEFAULT '', r2_key String DEFAULT '',
    created_at DateTime DEFAULT now(), updated_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(updated_at) ORDER BY (id);
