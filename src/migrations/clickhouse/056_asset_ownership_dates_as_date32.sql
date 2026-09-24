-- 056: Date cannot store days before 1970-01-01. The 1900-01-01 ownership baseline
-- was clamped to 1970-01-01, so every period of a release shared one sort key
-- and a closed period became an empty window. Facts for that ISRC then dropped
-- out of analytics. effective_from is in the sorting key and cannot be MODIFY'd.
-- Build a Date32 table and swap it in. The previous table is kept as legacy.
-- Full ownership sync from Postgres repopulates the new table.
CREATE TABLE IF NOT EXISTS music_analytics.pg_asset_ownership_sync_date32
(
    isrc String,
    release_id String,
    tenant_id String,
    label_id String,
    effective_from Date32,
    effective_to Nullable(Date32),
    revenue_effective_from Date32,
    revenue_effective_to Nullable(Date32),
    updated_at DateTime64(3) DEFAULT now64(3),
    is_deleted UInt8 DEFAULT 0
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (isrc, effective_from, release_id)
COMMENT 'Historical ownership windows. Date32 keeps the 1900-01-01 baseline';

RENAME TABLE
    music_analytics.pg_asset_ownership_sync TO music_analytics.pg_asset_ownership_sync_date_legacy,
    music_analytics.pg_asset_ownership_sync_date32 TO music_analytics.pg_asset_ownership_sync;
