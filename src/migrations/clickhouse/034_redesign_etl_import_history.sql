-- Migration 034: Redesign etl_import_history
-- Old table: 1 record = 1 DSP folder (folder-level granularity), chỉ dùng cho FTP.
-- New table: 1 record = 1 file = 1 job (per-file granularity), dùng cho tất cả job types.
-- Breaking change: ORDER BY thay đổi nên DROP + CREATE lại.
DROP TABLE IF EXISTS music_analytics.etl_import_history;

CREATE TABLE IF NOT EXISTS music_analytics.etl_import_history
(
    id              String          DEFAULT generateUUIDv4(),
    job_id          String          DEFAULT '' COMMENT 'FK → import_jobs.id',
    batch_id        String          DEFAULT '',

    period          String          DEFAULT '' COMMENT 'YYYYMM — data period',
    source_type     LowCardinality(String) DEFAULT '' COMMENT 'FTP_SYNC_PERIOD | FTP_SYNC_ALL | FTP_RETRY | FTP_AUTO_CRON | WMG_UPLOAD | REPORT_UPLOAD | SPOTIFY_R2_SYNC | STATEMENTS_UPLOAD',
    category        LowCardinality(String) DEFAULT '' COMMENT 'trends | usage | sales | statements | ...',
    dsp_folder      String          DEFAULT '' COMMENT 'DSP folder name (FTP) hoặc dsp identifier',

    -- Per-file detail
    file_name       String          DEFAULT '' COMMENT 'Tên file (basename)',
    file_directory  String          DEFAULT '' COMMENT 'Thư mục chứa file',
    file_path       String          DEFAULT '' COMMENT 'Full path hoặc relative path của file',

    -- Processing stats
    status          LowCardinality(String) DEFAULT 'processing' COMMENT 'processing | done | error',
    total_lines     UInt64          DEFAULT 0  COMMENT 'Tổng số dòng trong file kể cả header',
    processed_rows  UInt64          DEFAULT 0  COMMENT 'Số dòng xử lý thành công',
    skipped_rows    UInt64          DEFAULT 0,
    error_rows      UInt64          DEFAULT 0,

    duration_ms     UInt64          DEFAULT 0,
    error_message   String          DEFAULT '',
    started_at      DateTime64(3)   DEFAULT now64(3),
    completed_at    DateTime64(3)   DEFAULT now64(3)
)
ENGINE = ReplacingMergeTree(completed_at)
ORDER BY (job_id, file_path)
PARTITION BY toYYYYMM(started_at)
SETTINGS index_granularity = 8192
COMMENT 'Per-file import tracking. 1 record = 1 file trong 1 job. Query với FINAL để lấy state cuối.';

ALTER TABLE music_analytics.etl_import_history
    ADD INDEX IF NOT EXISTS idx_job_id job_id TYPE bloom_filter() GRANULARITY 4;

ALTER TABLE music_analytics.etl_import_history
    ADD INDEX IF NOT EXISTS idx_source_type source_type TYPE set(16) GRANULARITY 4;
