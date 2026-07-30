-- Migration 035: Add file_size_bytes column to etl_import_history
ALTER TABLE music_analytics.etl_import_history
    ADD COLUMN IF NOT EXISTS file_size_bytes UInt64 DEFAULT 0 COMMENT 'File size in bytes';
