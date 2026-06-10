-- ============================================================================
-- Migration 014: Create ftp_exclude_patterns
-- Purpose: Bảng cấu hình các pattern để LOẠI BỎ folder/file DSP khỏi luồng FTP sync.
--          Khi sync, mọi folder/file có tên khớp pattern (đang active) sẽ KHÔNG
--          được kéo về và KHÔNG parse. Data cũ đã import trước đó được giữ nguyên.
-- Pattern type:
--   - 'contains' : tên chứa chuỗi (case-insensitive), ví dụ keyword '.removed_at'
--   - 'regex'    : biểu thức chính quy JavaScript (RegExp)
-- Scope: 'folder' | 'file' | 'both' — quyết định pattern áp cho tên folder, file, hay cả hai.
-- Engine: ReplacingMergeTree(updated_at) — soft delete qua is_deleted, dedup theo id.
-- ============================================================================

CREATE TABLE IF NOT EXISTS music_analytics.ftp_exclude_patterns (
    id            String,                  -- UUID, primary key
    pattern       String,                  -- keyword hoặc regex string
    pattern_type  LowCardinality(String),  -- 'contains' | 'regex'
    scope         LowCardinality(String),  -- 'folder' | 'file' | 'both'
    is_active     UInt8 DEFAULT 1,         -- 1 = đang áp dụng, 0 = tạm tắt
    description   String DEFAULT '',
    is_deleted    UInt8 DEFAULT 0,         -- 1 = đã xóa (soft delete)
    created_at    DateTime DEFAULT now(),
    updated_at    DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY id
COMMENT 'Patterns để loại folder/file DSP khỏi FTP sync (contains/regex, scope folder/file/both)';
