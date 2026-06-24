-- ============================================================================
-- Migration 021: Add release_upc to pg_tracks_sync
-- Purpose: Allow analytics ranking queries to exclude generated UPC placeholders.
-- ============================================================================

ALTER TABLE music_analytics.pg_tracks_sync
    ADD COLUMN IF NOT EXISTS release_upc String DEFAULT '' AFTER release_id;

ALTER TABLE music_analytics.pg_tracks_sync
    COMMENT COLUMN release_upc 'UPC of the release in PostgreSQL. Used to filter out generated UPC placeholders such as ISRC-{isrc}.';
