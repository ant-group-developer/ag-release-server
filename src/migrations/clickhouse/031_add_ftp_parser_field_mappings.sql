ALTER TABLE music_analytics.ftp_dsp_parser_configs
    ADD COLUMN IF NOT EXISTS field_mappings String DEFAULT '[]'
    AFTER exclude_patterns;
