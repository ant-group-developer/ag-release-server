-- =====================================================
-- Migration 017: Metadata Enrichment Changelog
-- Lưu lịch sử mọi thay đổi metadata PostgreSQL 
-- khi enrichment từ Spotify/Deezer APIs.
-- MergeTree append-only: mỗi change = 1 row, không cần FINAL.
-- =====================================================

CREATE TABLE IF NOT EXISTS music_analytics.metadata_enrichment_log
(
    -- ── Identity ──────────────────────────────────────
    id                  String                                    COMMENT 'UUID v4 mỗi bản ghi change',
    scan_id             String                                    COMMENT 'UUID v4 nhóm các change trong cùng 1 lần scan',

    -- ── Entity Reference ─────────────────────────────
    entity_type         LowCardinality(String)                    COMMENT 'release | track | artist | release_artist | track_artist',
    entity_id           String                                    COMMENT 'UUID/ID của entity trong PostgreSQL',
    release_id          String                 DEFAULT ''         COMMENT 'Release UUID liên quan',
    isrc                String                 DEFAULT ''         COMMENT 'ISRC của track liên quan',
    upc                 String                 DEFAULT ''         COMMENT 'UPC của release liên quan',

    -- ── Change Detail ────────────────────────────────
    field_name          String                                    COMMENT 'Tên field thay đổi (upc, title, release_date, artist_name...)',
    old_value           String                 DEFAULT ''         COMMENT 'Giá trị cũ',
    new_value           String                 DEFAULT ''         COMMENT 'Giá trị mới',
    change_type         LowCardinality(String)                    COMMENT 'update | create | link',

    -- ── Enrichment Source ────────────────────────────
    enrichment_source   LowCardinality(String)                    COMMENT 'spotify | deezer',
    api_track_id        String                 DEFAULT ''         COMMENT 'Track ID trên Spotify/Deezer',
    api_album_id        String                 DEFAULT ''         COMMENT 'Album ID trên Spotify/Deezer',
    api_artist_id       String                 DEFAULT ''         COMMENT 'Artist ID trên Spotify/Deezer',

    -- ── Status ───────────────────────────────────────
    status              LowCardinality(String) DEFAULT 'applied'  COMMENT 'applied | dry_run | error',
    error_message       String                 DEFAULT '',
    is_dry_run          UInt8                  DEFAULT 0,

    -- ── Audit ────────────────────────────────────────
    created_at          DateTime64(3)          DEFAULT now64(3),
    created_by          String                 DEFAULT ''         COMMENT 'User ID khởi tạo scan'
)
ENGINE = MergeTree()
ORDER BY (scan_id, entity_type, entity_id, created_at)
PARTITION BY toYYYYMM(created_at)
SETTINGS index_granularity = 8192
COMMENT 'Audit log cho enrichment metadata từ Spotify/Deezer → PostgreSQL. Append-only.';

-- Skip-index để filter nhanh
ALTER TABLE music_analytics.metadata_enrichment_log
    ADD INDEX IF NOT EXISTS idx_scan_id scan_id TYPE bloom_filter() GRANULARITY 4;

ALTER TABLE music_analytics.metadata_enrichment_log
    ADD INDEX IF NOT EXISTS idx_entity_type entity_type TYPE set(8) GRANULARITY 4;

ALTER TABLE music_analytics.metadata_enrichment_log
    ADD INDEX IF NOT EXISTS idx_isrc isrc TYPE bloom_filter() GRANULARITY 4;

ALTER TABLE music_analytics.metadata_enrichment_log
    ADD INDEX IF NOT EXISTS idx_upc upc TYPE bloom_filter() GRANULARITY 4;

ALTER TABLE music_analytics.metadata_enrichment_log
    ADD INDEX IF NOT EXISTS idx_enrichment_source enrichment_source TYPE set(4) GRANULARITY 4;
