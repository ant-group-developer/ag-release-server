-- ============================================================================
-- Migration 006: Recreate pg_tracks_sync to apply artist_ids Array column and trigger backfill
-- ============================================================================

DROP TABLE IF EXISTS music_analytics.pg_tracks_sync;

CREATE TABLE IF NOT EXISTS music_analytics.pg_tracks_sync (
    isrc String COMMENT 'International Standard Recording Code. If it starts with ''UPC-'', it represents an album-level (UPC) record instead of a track-level ISRC.',
    tenant_id String,
    release_id String,
    label_id String,
    artist_ids Array(String),
    is_deleted UInt8 DEFAULT 0,
    updated_at DateTime DEFAULT now()
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY isrc
COMMENT 'Bảng đồng bộ metadata tracks và releases từ PostgreSQL';
