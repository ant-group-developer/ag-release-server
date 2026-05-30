export const CLICKHOUSE_CLIENT = 'CLICKHOUSE_CLIENT';

export const CLICKHOUSE_TABLES = {
  FACT_DSP_COMPREHENSIVE_REPORT: 'fact_dsp_comprehensive_report',
  FACT_SALES_REPORT: 'fact_sales_report',
  TRACK_CUBE: 'track_cube',
  TRACK_MONTHLY_SUMMARY: 'track_monthly_summary',
  ETL_IMPORT_HISTORY: 'etl_import_history',
  SALES_ISRC_MONTHLY: 'sales_isrc_monthly_cube',
  SALES_DSP_MONTHLY: 'sales_dsp_monthly_cube',
  SALES_ISRC_DSP_MONTHLY: 'sales_isrc_dsp_monthly_cube',
  SALES_ISRC_COUNTRY_MONTHLY: 'sales_isrc_country_monthly_cube',
  TRENDS_ISRC_SUMMARY: 'trends_isrc_summary',
  TRENDS_ISRC_DAILY_CUBE: 'trends_isrc_daily_cube',
  TRENDS_DSP_DAILY_CUBE: 'trends_dsp_daily_cube',
  PG_TRACKS_SYNC: 'pg_tracks_sync',
  TRENDS_DSP_MONTHLY: 'trends_dsp_monthly_cube',
  SALES_TER_MONTHLY: 'sales_ter_monthly_cube',
  TRENDS_TER_MONTHLY: 'trends_ter_monthly_cube',
} as const;
