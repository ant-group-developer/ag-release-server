-- 052: Them cot is_deleted (tombstone) cho pg_asset_ownership_sync.
-- Ly do: khi mot release bi xoa, FK CASCADE moi (xem migration PG
-- 1787900000000-OwnershipCascadeAndSyncTrigger) se xoa cac row trong
-- asset_ownership_periods va asset_ownership_transfer_events, va trigger
-- AFTER DELETE se enqueue 1 job DELETE len clickhouse_sync_outbox. ClickHouse
-- khong co cach "xoa han" dong bo tu ReplacingMergeTree ma khong dung mutation
-- ALTER TABLE ... DELETE (nang, async), nen thay vao do bang duoc them cot
-- is_deleted (tombstone), giong hiet convention dang dung o pg_tracks_sync.is_deleted.
-- Moi query doc bang nay bat buoc phai loc `WHERE is_deleted = 0` (xem
-- src/modules/analytics/utils/ownership-join.util.ts va cac service inline copy).
-- Cot khong nam trong ORDER BY/PRIMARY KEY cua bang, tuong thich nguoc 100%
-- (DEFAULT 0 -> moi row cu van duoc coi la chua bi xoa, khong can backfill).
ALTER TABLE music_analytics.pg_asset_ownership_sync
	ADD COLUMN IF NOT EXISTS is_deleted UInt8 DEFAULT 0;
