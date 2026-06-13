-- =====================================================
-- Migration 011: Import Jobs Tracking Table
-- Audit log cho mỗi lần import file (WMG, CI...) hoặc sync FTP.
-- ReplacingMergeTree(updated_at): mỗi update = insert row mới cùng id, query FINAL để lấy state cuối.
-- =====================================================

CREATE TABLE IF NOT EXISTS music_analytics.import_jobs
(
    -- ── Identity ──────────────────────────────────────
    id                  String                                    COMMENT 'UUID v4 do app sinh',
    source_type         LowCardinality(String)                    COMMENT 'WMG_UPLOAD | FTP_SYNC_PERIOD | FTP_SYNC_ALL | FTP_RETRY | FTP_AUTO_CRON',
    status              LowCardinality(String) DEFAULT 'PENDING'  COMMENT 'PENDING | PROCESSING | COMPLETED | FAILED | CANCELLED',

    -- ── File info (nullable cho FTP_SYNC_*) ──────────
    file_name           String                 DEFAULT ''         COMMENT 'Tên file gốc do user upload',
    file_path           String                 DEFAULT ''         COMMENT 'Đường dẫn tạm trên disk khi đang process',
    file_size_bytes     UInt64                 DEFAULT 0,
    file_hash           String                 DEFAULT ''         COMMENT 'SHA-256 (chưa dùng — chuẩn bị cho idempotency)',

    -- ── Input params (DTO body, period, force...) ────
    params              String                 DEFAULT '{}'       COMMENT 'JSON string — tham số đầu vào',

    -- ── Progress ─────────────────────────────────────
    progress_current    UInt64                 DEFAULT 0          COMMENT 'Số bước/folder đã xử lý (FTP) hoặc 0/1 (single file)',
    progress_total      UInt64                 DEFAULT 0,
    progress_label      String                 DEFAULT ''         COMMENT 'Mô tả ngắn step hiện tại',

    -- ── Row counters (cho file import) ───────────────
    total_rows          UInt64                 DEFAULT 0,
    processed_rows      UInt64                 DEFAULT 0,
    skipped_rows        UInt64                 DEFAULT 0,
    error_rows          UInt64                 DEFAULT 0,

    -- ── Result / Error ───────────────────────────────
    result              String                 DEFAULT ''         COMMENT 'JSON string — full result object khi COMPLETED',
    error_message       String                 DEFAULT ''         COMMENT 'Error message khi FAILED',
    batch_id            String                 DEFAULT ''         COMMENT 'ClickHouse batch_id reference (nếu có)',

    -- ── Audit ────────────────────────────────────────
    tenant_id           String                 DEFAULT ''         COMMENT 'Tenant trigger job (NULL cho cron/system jobs)',
    created_by          String                 DEFAULT ''         COMMENT 'User id trigger job',
    created_at          DateTime64(3)          DEFAULT now64(3),
    started_at          Nullable(DateTime64(3)),
    finished_at         Nullable(DateTime64(3)),
    duration_ms         UInt64                 DEFAULT 0,
    updated_at          DateTime64(3)          DEFAULT now64(3)   COMMENT 'Version cho ReplacingMergeTree'
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (id)
PARTITION BY toYYYYMM(created_at)
SETTINGS index_granularity = 8192
COMMENT 'Audit log cho mỗi lần import / sync. Engine ReplacingMergeTree — query với FINAL để lấy state cuối.';

-- Skip-index để filter list nhanh theo status / source_type / tenant
ALTER TABLE music_analytics.import_jobs
    ADD INDEX IF NOT EXISTS idx_status status TYPE set(8) GRANULARITY 4;

ALTER TABLE music_analytics.import_jobs
    ADD INDEX IF NOT EXISTS idx_source_type source_type TYPE set(8) GRANULARITY 4;

ALTER TABLE music_analytics.import_jobs
    ADD INDEX IF NOT EXISTS idx_tenant tenant_id TYPE bloom_filter() GRANULARITY 4;
