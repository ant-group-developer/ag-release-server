-- =====================================================
-- Migration 001: Initial Schema
-- Creates database, fact table, ETL tracking tables
-- =====================================================

CREATE DATABASE IF NOT EXISTS music_analytics;

-- ===========================================
-- Fact Table: DSP Comprehensive Report
-- Flat table (denormalized) optimized for OLAP
-- ===========================================
CREATE TABLE IF NOT EXISTS music_analytics.fact_dsp_comprehensive_report
(
    -- ── Time & Partner ──────────────────────────────────
    reporting_period          Date             COMMENT 'Report date (month/day granularity)',
    dsp_id                    LowCardinality(String)  COMMENT 'DSP source identifier (spotify, tiktok, fb, boomplay, awa...)',
    partner_id                String           DEFAULT ''   COMMENT 'Partner/distributor ID',
    account_identifier        String           DEFAULT ''   COMMENT 'Account or sub-account ID at DSP',
    licensor                  String           DEFAULT ''   COMMENT 'Licensor / rights holder name',
    label_name                String           DEFAULT ''   COMMENT 'Record label name',

    -- ── Geography ───────────────────────────────────────
    territory_code            LowCardinality(String) DEFAULT 'XX' COMMENT 'ISO-2 country code (VN, US, JP...). XX = unknown',

    -- ── Content Metadata ────────────────────────────────
    isrc                      String                          COMMENT 'International Standard Recording Code — primary key for stats',
    upc                       String           DEFAULT ''   COMMENT 'Universal Product Code (album level)',
    track_title               String           DEFAULT ''   COMMENT 'Track / song title',
    artist_name               String           DEFAULT ''   COMMENT 'Primary artist name',
    album_title               String           DEFAULT ''   COMMENT 'Album / release title',
    composer_name             String           DEFAULT ''   COMMENT 'Songwriter / composer name',
    track_id_internal         String           DEFAULT ''   COMMENT 'Internal track ID within DSP',

    -- ── Metrics ─────────────────────────────────────────
    quantity_total             UInt64           DEFAULT 0    COMMENT 'Total streams / views / plays',
    quantity_unique_users      UInt64           DEFAULT 0    COMMENT 'Unique listener count',
    quantity_invalid           UInt64           DEFAULT 0    COMMENT 'Invalid / bot / filtered plays',

    -- ── Classification ──────────────────────────────────
    usage_type                LowCardinality(String) DEFAULT '' COMMENT 'Usage type (stream, download, ringtone...)',
    monetisation_type         LowCardinality(String) DEFAULT '' COMMENT 'Monetisation type (SUBS, ADS, PAID, FREE...)',
    track_classification      LowCardinality(String) DEFAULT '' COMMENT 'Track classification (original, cover, remix...)',

    -- ── DSP-specific metadata ───────────────────────────
    metadata                  Map(String, String)             COMMENT 'Flexible key-value store for DSP-specific fields (likes, shares, device_type, age, play30s...)',

    -- ── Source ──────────────────────────────────────────
    source_category           LowCardinality(String) DEFAULT '' COMMENT 'Data source category: trends | usage',

    -- ── Audit ───────────────────────────────────────────
    created_at                DateTime         DEFAULT now()  COMMENT 'Row insertion timestamp',
    batch_id                  String           DEFAULT ''     COMMENT 'ETL batch identifier for data lineage tracking'
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(reporting_period)
ORDER BY (dsp_id, reporting_period, isrc, territory_code)
SETTINGS index_granularity = 8192
COMMENT 'Centralized DSP report table — denormalized flat table for OLAP analytics on billions of rows';

-- ===========================================
-- ETL Import History — tracking import state
-- ===========================================
CREATE TABLE IF NOT EXISTS music_analytics.etl_import_history
(
    id               String       DEFAULT generateUUIDv4(),
    period           String       COMMENT 'YYYYMM — data period',
    source_type      LowCardinality(String) COMMENT 'ftp | local',
    category         LowCardinality(String) COMMENT 'trends | usage',
    dsp_folder       String       COMMENT 'aum-audiomack, fbk-facebook...',
    status           LowCardinality(String) COMMENT 'downloading | parsing | done | error',
    rows_imported    UInt64       DEFAULT 0,
    files_processed  UInt32       DEFAULT 0,
    files_list       Array(String) DEFAULT [] COMMENT 'List of processed file names',
    duration_ms      UInt64       DEFAULT 0,
    error_message    String       DEFAULT '',
    batch_id         String       DEFAULT '',
    started_at       DateTime     DEFAULT now(),
    completed_at     DateTime     DEFAULT now()
)
ENGINE = ReplacingMergeTree(completed_at)
ORDER BY (period, category, dsp_folder)
COMMENT 'ETL import tracking — tracks which period+dsp has been imported';

-- ===========================================
-- ETL Config — runtime config persisted
-- ===========================================
CREATE TABLE IF NOT EXISTS music_analytics.etl_config
(
    key              String,
    value            String       DEFAULT '',
    updated_at       DateTime     DEFAULT now()
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (key)
COMMENT 'Key-value config store for ETL settings (sync_mode, sync_cron...)';
