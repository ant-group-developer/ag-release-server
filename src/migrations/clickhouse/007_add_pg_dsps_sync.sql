-- Migration: Add pg_dsps_sync table
-- Description: Bảng đồng bộ DSP từ PostgreSQL dsps

CREATE TABLE IF NOT EXISTS music_analytics.pg_dsps_sync (
    pg_uuid         String,
    dsp_code        String,
    dsp_name        String,
    dsp_ci_code     String,
    created_at      DateTime DEFAULT now(),
    updated_at      DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY pg_uuid
COMMENT 'Bảng đồng bộ DSP từ PostgreSQL dsps';