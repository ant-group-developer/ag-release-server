-- Migration: Add dsps_report table
-- Description: Bảng chứa tất cả DSP variants từ FTP folders, reports, excel files

CREATE TABLE IF NOT EXISTS music_analytics.dsps_report (
    id_dsps_report  String,
    pg_uuid         String,
    dsp_name        String,
    source          String,
    created_at      DateTime DEFAULT now(),
    updated_at      DateTime DEFAULT now()
)
ENGINE = ReplacingMergeTree(updated_at)
ORDER BY id_dsps_report
COMMENT 'Bảng chứa tất cả DSP variants từ FTP folders, reports, excel files';