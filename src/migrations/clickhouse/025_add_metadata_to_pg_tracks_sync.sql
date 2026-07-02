ALTER TABLE music_analytics.pg_tracks_sync
    ADD COLUMN IF NOT EXISTS track_title    String DEFAULT '',
    ADD COLUMN IF NOT EXISTS track_version  String DEFAULT '',
    ADD COLUMN IF NOT EXISTS release_title  String DEFAULT '',
    ADD COLUMN IF NOT EXISTS label_name     String DEFAULT '',
    ADD COLUMN IF NOT EXISTS artist_names   Array(String) DEFAULT [],
    ADD COLUMN IF NOT EXISTS cover_75       String DEFAULT '',
    ADD COLUMN IF NOT EXISTS cover_100      String DEFAULT '',
    ADD COLUMN IF NOT EXISTS cover_160      String DEFAULT '',
    ADD COLUMN IF NOT EXISTS cover_300      String DEFAULT '',
    ADD COLUMN IF NOT EXISTS cover_original String DEFAULT '',
    ADD COLUMN IF NOT EXISTS release_type   String DEFAULT 'audio';
