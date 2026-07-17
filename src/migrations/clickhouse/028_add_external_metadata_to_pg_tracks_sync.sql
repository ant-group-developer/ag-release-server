ALTER TABLE music_analytics.pg_tracks_sync
    ADD COLUMN IF NOT EXISTS track_metadata_spotify String DEFAULT '',
    ADD COLUMN IF NOT EXISTS track_metadata_deezer String DEFAULT '',
    ADD COLUMN IF NOT EXISTS release_metadata_spotify String DEFAULT '',
    ADD COLUMN IF NOT EXISTS release_metadata_deezer String DEFAULT '';
