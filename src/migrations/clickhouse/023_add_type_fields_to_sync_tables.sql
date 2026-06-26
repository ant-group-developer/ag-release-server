-- ============================================================================
-- Migration 023: Add type to pg_dsps_sync and release_type to pg_tracks_sync
-- Purpose: Support separating audio tracks and videos in ingestion and analytics.
-- ============================================================================

ALTER TABLE music_analytics.pg_dsps_sync
    ADD COLUMN IF NOT EXISTS type String DEFAULT 'audio';

ALTER TABLE music_analytics.pg_tracks_sync
    ADD COLUMN IF NOT EXISTS release_type String DEFAULT 'audio';
