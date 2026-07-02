-- Migration: Add dsp_report_stats table
-- Description: Materialized stats (total/pending releases) cho từng dsps_report.
--              Update qua service: sau assign/unassign, cuối ETL job, và cron 15p.
--              Đọc bằng FINAL để lấy phiên bản mới nhất (ReplacingMergeTree).

CREATE TABLE IF NOT EXISTS music_analytics.dsp_report_stats (
    id_dsps_report          String,
    total_releases_count    UInt64,
    pending_releases_count  UInt64,
    updated_at              DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY id_dsps_report
COMMENT 'Stats materialized cho từng dsps_report (total/pending releases). Update qua service.';
