ALTER TABLE music_analytics.report_source_configs
    ADD COLUMN IF NOT EXISTS import_source String DEFAULT '',
    ADD COLUMN IF NOT EXISTS field_mappings_json String DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS parser_options_json String DEFAULT '{}';
