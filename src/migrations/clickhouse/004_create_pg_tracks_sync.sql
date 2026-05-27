-- ============================================================================
-- Migration 004: Create pg_tracks_sync
-- Purpose: Bảng đồng bộ metadata tracks, releases và artist_ids từ PostgreSQL sang ClickHouse
-- Engine: ReplacingMergeTree để tự động ghi đè bản ghi trùng lặp theo updated_at mới nhất
-- ============================================================================

CREATE TABLE IF NOT EXISTS music_analytics.pg_tracks_sync (
    isrc String,
    tenant_id String,
    release_id String,
    label_id String,
    artist_ids Array(String), -- Mảng chứa danh sách ID nghệ sĩ tham gia track
    is_deleted UInt8 DEFAULT 0,
    updated_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY isrc
COMMENT 'Bảng đồng bộ metadata tracks và releases từ PostgreSQL';
