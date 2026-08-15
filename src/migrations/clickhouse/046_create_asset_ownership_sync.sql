CREATE TABLE IF NOT EXISTS music_analytics.pg_asset_ownership_sync
(
    isrc String,
    release_id String,
    tenant_id String,
    label_id String,
    effective_from Date,
    effective_to Nullable(Date),
    revenue_effective_from Date,
    revenue_effective_to Nullable(Date),
    updated_at DateTime64(3) DEFAULT now64(3)
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (isrc, effective_from, release_id)
COMMENT 'Historical ownership windows used to attribute analytics and revenue by source period';
