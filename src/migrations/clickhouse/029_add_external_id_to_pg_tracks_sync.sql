ALTER TABLE music_analytics.pg_tracks_sync
    ADD COLUMN IF NOT EXISTS external_id String DEFAULT ''
    COMMENT 'YouTube external video ID from videos.external_id';
