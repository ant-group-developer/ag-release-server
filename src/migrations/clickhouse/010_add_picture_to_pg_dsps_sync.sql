-- Migration: Add picture to pg_dsps_sync table
-- Description: Thêm cột picture để hiển thị logo/hình ảnh của DSP

ALTER TABLE music_analytics.pg_dsps_sync ADD COLUMN IF NOT EXISTS picture String;
