-- =====================================================
-- Migration 002: Sales Report Table
-- Separate fact table for monthly sales/revenue data
-- =====================================================

CREATE TABLE IF NOT EXISTS music_analytics.fact_sales_report
(
    -- ── Time ──────────────────────────────────────────
    reporting_period_start  Date             COMMENT 'Start of reporting period',
    reporting_period_end    Date             COMMENT 'End of reporting period',

    -- ── Partner ───────────────────────────────────────
    dsp_id                  LowCardinality(String)  COMMENT 'DSP identifier (spotify, deezer, audiomack...)',
    service_name            String           DEFAULT '' COMMENT 'Service sub-brand (Kugou, QQ Music, TikTok Music...)',
    dpid                    String           DEFAULT '' COMMENT 'DPID identifier',
    member_name             String           DEFAULT '' COMMENT 'Member/distributor name',
    label_name              String           DEFAULT '' COMMENT 'Label name',

    -- ── Geography ─────────────────────────────────────
    territory_code          LowCardinality(String) DEFAULT 'XX' COMMENT 'ISO-2 country code',

    -- ── Content ───────────────────────────────────────
    isrc                    String                  COMMENT 'International Standard Recording Code. If it starts with ''UPC-'', it represents an album-level (UPC) record instead of a track-level ISRC.',
    upc                     String           DEFAULT '' COMMENT 'UPC code',
    grid                    String           DEFAULT '' COMMENT 'Global Release Identifier',
    release_id              String           DEFAULT '' COMMENT 'Release ID (platform-specific)',
    track_title             String           DEFAULT '' COMMENT 'Track title',
    artist_name             String           DEFAULT '' COMMENT 'Artist name',
    album_title             String           DEFAULT '' COMMENT 'Album/release title',
    composer_name           String           DEFAULT '' COMMENT 'Composer name',
    genre                   LowCardinality(String) DEFAULT '' COMMENT 'Genre',

    -- ── Metrics ───────────────────────────────────────
    quantity                UInt64           DEFAULT 0  COMMENT 'Streams/plays count',
    quantity_creations      UInt64           DEFAULT 0  COMMENT 'Video creations (TikTok/Snap)',
    quantity_views          UInt64           DEFAULT 0  COMMENT 'Video views (TikTok/Snap)',

    -- ── Revenue ───────────────────────────────────────
    revenue_usd             Decimal128(18)   DEFAULT 0  COMMENT 'Payable amount in USD (exact decimal)',
    revenue_local           Decimal128(18)   DEFAULT 0  COMMENT 'Payable in local/statement currency (exact decimal)',
    revenue_currency        LowCardinality(String) DEFAULT 'USD' COMMENT 'Statement currency',

    -- ── Classification ────────────────────────────────
    usage_type              LowCardinality(String) DEFAULT '' COMMENT 'Usage type (Stream/Download/Ringtone/OnDemandStream/UGC)',
    monetisation_type       LowCardinality(String) DEFAULT '' COMMENT 'Monetisation type (ADS/SUBS/PAID/FREE)',
    service_tier            LowCardinality(String) DEFAULT '' COMMENT 'Subscription tier (Premium/Free/Family)',
    plan_name               LowCardinality(String) DEFAULT '' COMMENT 'Specific plan name',
    commercial_model        LowCardinality(String) DEFAULT '' COMMENT 'SubscriptionModel/AdvertisementSupportedModel',

    -- ── DSP-specific ──────────────────────────────────
    metadata                Map(String, String) COMMENT 'Extra DSP-specific fields',

    -- ── Audit ─────────────────────────────────────────
    source_category         LowCardinality(String) DEFAULT 'sales' COMMENT 'Always sales for this table',
    created_at              DateTime         DEFAULT now(),
    batch_id                String           DEFAULT ''
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(reporting_period_start)
ORDER BY (dsp_id, reporting_period_start, isrc, territory_code)
SETTINGS index_granularity = 8192
COMMENT 'Sales/revenue data from all DSPs — monthly settlement reports';
