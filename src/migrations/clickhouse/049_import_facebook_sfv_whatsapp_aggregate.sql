-- 049: Flip Facebook SFV + WhatsApp-Incentive-Pool file rules from ignore -> import
-- These 2 file types carry payout revenue (column `payout`) but no ISRC.
-- The parser now handles them as DSP-only aggregate rows (isrc='N/A'),
-- so the rules must be set to import for the data to be ingested.
-- ReplacingMergeTree(updated_at) keeps the row with latest updated_at per id.
-- Re-inserting with same id + incremented config_version + status='import' flips the rule.
-- If the rules don't exist or already are import, this is a no-op.

INSERT INTO music_analytics.ftp_report_file_rules
    (id, source, source_category, dsp_folder_pattern, file_name_pattern, status, parser_code, description, config_version, is_active, created_at, updated_at)
SELECT
    id,
    source,
    source_category,
    dsp_folder_pattern,
    file_name_pattern,
    'import' AS status,
    parser_code,
    description,
    config_version + 1 AS config_version,
    is_active,
    created_at,
    now() AS updated_at
FROM music_analytics.ftp_report_file_rules FINAL
WHERE id IN (
    'ad3b563b-309a-4b0c-86e7-d1c560d65c08',
    '1b887b89-8176-4477-b902-ba850a5a4adb'
)
AND is_active = 1
AND status = 'ignore';
