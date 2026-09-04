-- Detect channels whose identity tenant does not match open asset-ownership
-- periods of videos currently on the channel. Operators pick dates and run
-- POST /channels/:id/transfer (or assets_only) — this script does not mutate.
--
-- Also reports catalog size to decide CHANNEL_TRANSFER_MAX_RELEASES.

-- 1. Identity vs open ownership period
SELECT
	c.id AS channel_id,
	c.name AS channel_name,
	c.tenant_id AS channel_tenant_id,
	r.id AS release_id,
	r.tenant_id AS release_tenant_id,
	p.tenant_id AS open_period_tenant_id,
	to_char(p.effective_from, 'YYYY-MM-DD') AS open_effective_from,
	to_char(p.revenue_effective_from, 'YYYY-MM-DD') AS open_revenue_effective_from
FROM channels c
JOIN videos v ON v.channel_id = c.id
JOIN releases r ON r.id = v.release_id
LEFT JOIN asset_ownership_periods p
	ON p.release_id = r.id AND p.effective_to IS NULL
WHERE c.tenant_id IS DISTINCT FROM COALESCE(p.tenant_id, r.tenant_id)
ORDER BY c.name, r.id;

-- 2. Channel identity moved, zero videos
SELECT c.id, c.name, c.tenant_id
FROM channels c
LEFT JOIN videos v ON v.channel_id = c.id
WHERE v.id IS NULL
  AND c.tenant_id IS NOT NULL;

-- 3. Catalog size: videos per channel
SELECT
	percentile_cont(0.95) WITHIN GROUP (ORDER BY video_count) AS p95_videos,
	max(video_count) AS max_videos,
	count(*) FILTER (WHERE video_count > 500) AS channels_over_cap
FROM (
	SELECT v.channel_id, count(*) AS video_count
	FROM videos v
	WHERE v.channel_id IS NOT NULL
	GROUP BY v.channel_id
) t;
