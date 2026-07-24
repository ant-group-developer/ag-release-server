-- Runtime presentation metadata for raw analytics import_source values.
CREATE TABLE IF NOT EXISTS music_analytics.analytics_source_type_configs
(
    source_type    LowCardinality(String),
    label          String,
    image_url      Nullable(String) DEFAULT NULL,
    is_active      UInt8 DEFAULT 1,
    config_version UInt64,
    created_at     DateTime64(3) DEFAULT now64(3),
    updated_at     DateTime64(3) DEFAULT now64(3)
)
ENGINE = ReplacingMergeTree(config_version)
ORDER BY source_type
COMMENT 'Presentation config for analytics import sources; independent from fact cubes';

INSERT INTO music_analytics.analytics_source_type_configs
    (source_type, label, image_url, is_active, config_version)
VALUES
    ('ftp', 'Merlin', NULL, 1, 1),
    ('wmg_report', 'WMG', NULL, 1, 1),
    ('spotify_report', 'Spotify', NULL, 1, 1),
    ('bombshelter', 'Bombshelter', NULL, 1, 1);
