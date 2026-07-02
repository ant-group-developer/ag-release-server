-- ============================================================================
-- Migration 024: Add channel_id to pg_tracks_sync
-- Purpose: Support statistics theo channel cho video releases.
-- Cot channel_id = UUID cua bang channels Postgres.
-- Video chua duoc enrich hoac audio track -> channel_id = ''
-- ============================================================================

ALTER TABLE music_analytics.pg_tracks_sync
    ADD COLUMN IF NOT EXISTS channel_id String DEFAULT '';
