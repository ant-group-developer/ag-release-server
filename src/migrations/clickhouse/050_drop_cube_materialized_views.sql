-- 050: Drop insert-triggered cube materialized views.
--
-- Cubes (SummingMergeTree) were filled two ways:
--   1. MVs on fact_sales_report / fact_dsp_comprehensive_report (INSERT trigger)
--   2. CubeRebuildService DROP PARTITION + INSERT from fact after the batch
--
-- MVs only see INSERT. During a period sync the pipeline deletes then
-- re-inserts each DSP's fact rows; the delete does not subtract from the cube,
-- the insert adds on top of the previous rebuild → totals double until the
-- period-end rebuild. Fresh DSP inserts into an already-rebuilt month have
-- the same problem.
--
-- Every import path already rebuilds affected partitions after its fact
-- writes, so the MVs are redundant and harmful. Cubes become rebuild-only.
-- Target tables are unchanged.

DROP VIEW IF EXISTS music_analytics.sales_dsp_monthly_cube_v2_mv;
DROP VIEW IF EXISTS music_analytics.sales_ter_monthly_cube_v2_mv;
DROP VIEW IF EXISTS music_analytics.sales_export_monthly_cube_mv;
DROP VIEW IF EXISTS music_analytics.trends_dsp_monthly_cube_mv;
DROP VIEW IF EXISTS music_analytics.trends_ter_monthly_cube_mv;
DROP VIEW IF EXISTS music_analytics.trends_dsp_daily_cube_mv;
DROP VIEW IF EXISTS music_analytics.trends_ter_daily_cube_mv;
DROP VIEW IF EXISTS music_analytics.trends_isrc_daily_cube_mv;
DROP VIEW IF EXISTS music_analytics.trends_demographics_cube_mv;

-- Leftover names from earlier cube versions, in case they still exist.
DROP VIEW IF EXISTS music_analytics.sales_dsp_monthly_cube_mv;
DROP VIEW IF EXISTS music_analytics.sales_ter_monthly_cube_mv;
