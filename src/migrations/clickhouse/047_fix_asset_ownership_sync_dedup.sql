-- 047: Deduplicate pg_asset_ownership_sync rows that share the same (isrc, window)
-- but have different release_id. Before fix, syncOwnershipForReleases expanded each
-- ownership period x all ISRCs of the release, so an ISRC in multiple releases
-- with the same window produced N rows. The analytics LEFT JOIN on window alone
-- then fanned out each fact row N times, inflating sum() results.
-- This cleanup keeps only the row with the latest updated_at per (isrc, window).
-- Safe to re-run (idempotent): re-inserts the winner rows; ReplacingMergeTree
-- keeps the latest updated_at, and the DELETE removes the losers.

-- Step 1: re-insert the winner row per (isrc, window) with a fresh updated_at
-- so it survives the subsequent delete (ReplacingMergeTree picks max updated_at).
INSERT INTO music_analytics.pg_asset_ownership_sync
  (isrc, release_id, tenant_id, label_id, effective_from, effective_to, revenue_effective_from, revenue_effective_to, updated_at)
SELECT
  isrc,
  argMax(release_id, updated_at) AS release_id,
  argMax(tenant_id, updated_at) AS tenant_id,
  argMax(label_id, updated_at) AS label_id,
  effective_from,
  effective_to,
  revenue_effective_from,
  revenue_effective_to,
  now64(3) AS updated_at
FROM music_analytics.pg_asset_ownership_sync FINAL
GROUP BY isrc, effective_from, effective_to, revenue_effective_from, revenue_effective_to
HAVING count() > 1;

-- Step 2: delete the loser rows (all rows except the winner) — executed by app
-- via ALTER TABLE ... DELETE WHERE (isrc, effective_from, ...) IN (losers).
-- ClickHouse mutations are async; the INSERT above ensures FINAL still returns
-- the correct single row even before the mutation completes.
-- NOTE: run the following mutation manually if async mutations are disabled:
-- ALTER TABLE music_analytics.pg_asset_ownership_sync DELETE WHERE
--   (isrc, effective_from, effective_to, revenue_effective_from, revenue_effective_to, updated_at) NOT IN (
--     SELECT isrc, effective_from, effective_to, revenue_effective_from, revenue_effective_to, max(updated_at)
--     FROM music_analytics.pg_asset_ownership_sync FINAL
--     GROUP BY isrc, effective_from, effective_to, revenue_effective_from, revenue_effective_to
--   );
