import { Injectable, Logger } from '@nestjs/common';
import { CLICKHOUSE_TABLES } from '../../../clickhouse/clickhouse.constants';
import { ClickHouseService } from '../../../clickhouse/clickhouse.service';
import { REVENUE_USD_EXPRESSION } from './revenue-sql.util';

@Injectable()
export class CubeRebuildService {
	private readonly logger = new Logger(CubeRebuildService.name);

	constructor(private readonly clickHouseService: ClickHouseService) {}

	/**
	 * Rebuild sales cubes for a list of periods (e.g. ['2024-04', '2024-05'])
	 */
	async rebuildSalesCubesForPeriods(periods: string[]): Promise<void> {
		const uniquePeriods = [...new Set(periods)].map((p) =>
			p.replace(/-/g, '').substring(0, 6),
		);
		if (uniquePeriods.length === 0) return;

		this.logger.log(
			`Rebuilding sales cubes for partitions: ${uniquePeriods.join(', ')}`,
		);

		for (const partition of uniquePeriods) {
			try {
				// 1. Drop partitions from all sales cubes (including export cube)
				await this.clickHouseService
					.execute(
						`ALTER TABLE music_analytics.${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY} DROP PARTITION '${partition}'`,
					)
					.catch((err) =>
						this.logger.debug(
							`DROP PARTITION on sales dsp failed: ${err.message}`,
						),
					);

				await this.clickHouseService
					.execute(
						`ALTER TABLE music_analytics.${CLICKHOUSE_TABLES.SALES_TER_MONTHLY} DROP PARTITION '${partition}'`,
					)
					.catch((err) =>
						this.logger.debug(
							`DROP PARTITION on sales ter failed: ${err.message}`,
						),
					);

				await this.clickHouseService
					.execute(
						`ALTER TABLE music_analytics.${CLICKHOUSE_TABLES.SALES_EXPORT_MONTHLY} DROP PARTITION '${partition}'`,
					)
					.catch((err) =>
						this.logger.debug(
							`DROP PARTITION on sales export failed: ${err.message}`,
						),
					);

				// 2. Re-insert aggregated data for the partition into sales dsp cube
				await this.clickHouseService.execute(`
          INSERT INTO music_analytics.${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY}
          SELECT
              toStartOfMonth(f.reporting_period_start) AS period,
              f.dsp_id,
              f.isrc,
              if(f.import_source = '', 'ftp', f.import_source) AS import_source,
              sum(f.quantity) AS total_quantity,
              ${REVENUE_USD_EXPRESSION} AS total_revenue_usd
          FROM music_analytics.${CLICKHOUSE_TABLES.FACT_SALES_REPORT} f
          LEFT JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.EXCHANGE_RATES} FINAL) er
              ON formatDateTime(f.reporting_period_start, '%Y-%m') = er.rate_month
              AND f.revenue_currency = er.currency
          WHERE toYYYYMM(f.reporting_period_start) = '${partition}'
          GROUP BY period, f.dsp_id, f.isrc, import_source
        `);

				// 3. Re-insert aggregated data for the partition into sales ter cube
				await this.clickHouseService.execute(`
          INSERT INTO music_analytics.${CLICKHOUSE_TABLES.SALES_TER_MONTHLY}
          SELECT
              toStartOfMonth(f.reporting_period_start) AS period,
              f.territory_code,
              f.isrc,
              if(f.import_source = '', 'ftp', f.import_source) AS import_source,
              sum(f.quantity) AS total_quantity,
              ${REVENUE_USD_EXPRESSION} AS total_revenue_usd
          FROM music_analytics.${CLICKHOUSE_TABLES.FACT_SALES_REPORT} f
          LEFT JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.EXCHANGE_RATES} FINAL) er
              ON formatDateTime(f.reporting_period_start, '%Y-%m') = er.rate_month
              AND f.revenue_currency = er.currency
          WHERE toYYYYMM(f.reporting_period_start) = '${partition}'
          GROUP BY period, f.territory_code, f.isrc, import_source
        `);

				// 4. Re-insert aggregated data for the partition into sales export cube
				await this.clickHouseService.execute(`
          INSERT INTO music_analytics.${CLICKHOUSE_TABLES.SALES_EXPORT_MONTHLY}
          SELECT
              toStartOfMonth(f.reporting_period_start) AS period,
              f.dsp_id,
              f.territory_code,
              f.isrc,
              any(f.upc) AS upc,
              any(f.track_title) AS track_title,
              any(f.album_title) AS album_title,
              any(f.artist_name) AS artist_name,
              any(f.label_name) AS label_name,
              sum(f.quantity) AS total_usage,
              ${REVENUE_USD_EXPRESSION} AS revenue_usd
          FROM music_analytics.${CLICKHOUSE_TABLES.FACT_SALES_REPORT} f
          LEFT JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.EXCHANGE_RATES} FINAL) er
              ON formatDateTime(f.reporting_period_start, '%Y-%m') = er.rate_month
              AND f.revenue_currency = er.currency
          WHERE toYYYYMM(f.reporting_period_start) = '${partition}'
          GROUP BY period, f.dsp_id, f.territory_code, f.isrc
        `);

				this.logger.log(
					`Finished rebuilding sales partition: ${partition}`,
				);
			} catch (err) {
				this.logger.error(
					`Failed to rebuild sales partition ${partition}: ${err.message}`,
					err.stack,
				);
			}
		}
	}

	/**
	 * Rebuild trends/usage cubes for a list of periods (e.g. ['2024-04', '2024-05'])
	 */
	async rebuildTrendsCubesForPeriods(periods: string[]): Promise<void> {
		const uniquePeriods = [...new Set(periods)].map((p) =>
			p.replace(/-/g, '').substring(0, 6),
		);
		if (uniquePeriods.length === 0) return;

		this.logger.log(
			`Rebuilding trends/usage cubes for partitions: ${uniquePeriods.join(', ')}`,
		);

		for (const partition of uniquePeriods) {
			try {
				// 1. Drop partitions from cubes
				await this.clickHouseService
					.execute(
						`ALTER TABLE music_analytics.${CLICKHOUSE_TABLES.TRENDS_DSP_MONTHLY} DROP PARTITION '${partition}'`,
					)
					.catch((err) =>
						this.logger.debug(
							`DROP PARTITION on trends dsp monthly failed: ${err.message}`,
						),
					);

				await this.clickHouseService
					.execute(
						`ALTER TABLE music_analytics.${CLICKHOUSE_TABLES.TRENDS_TER_MONTHLY} DROP PARTITION '${partition}'`,
					)
					.catch((err) =>
						this.logger.debug(
							`DROP PARTITION on trends ter monthly failed: ${err.message}`,
						),
					);

				await this.clickHouseService
					.execute(
						`ALTER TABLE music_analytics.${CLICKHOUSE_TABLES.TRENDS_DSP_DAILY_CUBE} DROP PARTITION '${partition}'`,
					)
					.catch((err) =>
						this.logger.debug(
							`DROP PARTITION on trends dsp daily failed: ${err.message}`,
						),
					);

				await this.clickHouseService
					.execute(
						`ALTER TABLE music_analytics.${CLICKHOUSE_TABLES.TRENDS_ISRC_DAILY_CUBE} DROP PARTITION '${partition}'`,
					)
					.catch((err) =>
						this.logger.debug(
							`DROP PARTITION on trends isrc daily failed: ${err.message}`,
						),
					);

				// 2. Re-insert aggregated data for trends dsp monthly cube
				await this.clickHouseService.execute(`
          INSERT INTO music_analytics.${CLICKHOUSE_TABLES.TRENDS_DSP_MONTHLY}
          SELECT
              toStartOfMonth(reporting_period) AS period,
              dsp_id,
              isrc,
              sum(quantity_total) AS total_quantity
          FROM music_analytics.${CLICKHOUSE_TABLES.FACT_DSP_COMPREHENSIVE_REPORT}
          WHERE source_category IN ('trends', 'usage') AND toYYYYMM(reporting_period) = '${partition}'
          GROUP BY period, dsp_id, isrc
        `);

				// 3. Re-insert aggregated data for trends ter monthly cube
				await this.clickHouseService.execute(`
          INSERT INTO music_analytics.${CLICKHOUSE_TABLES.TRENDS_TER_MONTHLY}
          SELECT
              toStartOfMonth(reporting_period) AS period,
              territory_code,
              isrc,
              sum(quantity_total) AS total_quantity
          FROM music_analytics.${CLICKHOUSE_TABLES.FACT_DSP_COMPREHENSIVE_REPORT}
          WHERE source_category IN ('trends', 'usage') AND toYYYYMM(reporting_period) = '${partition}'
          GROUP BY period, territory_code, isrc
        `);

				// 4. Re-insert aggregated data for trends dsp daily cube
				await this.clickHouseService.execute(`
          INSERT INTO music_analytics.${CLICKHOUSE_TABLES.TRENDS_DSP_DAILY_CUBE}
          SELECT
              reporting_period AS reporting_date,
              dsp_id,
              isrc,
              sum(quantity_total) AS total_quantity,
              sum(quantity_unique_users) AS total_unique_users
          FROM music_analytics.${CLICKHOUSE_TABLES.FACT_DSP_COMPREHENSIVE_REPORT}
          WHERE toYYYYMM(reporting_period) = '${partition}'
          GROUP BY reporting_date, dsp_id, isrc
        `);

				// 5. Re-insert aggregated data for trends isrc daily cube
				await this.clickHouseService.execute(`
          INSERT INTO music_analytics.${CLICKHOUSE_TABLES.TRENDS_ISRC_DAILY_CUBE}
          SELECT
              reporting_period AS reporting_date,
              isrc,
              sum(quantity_total) AS total_quantity,
              sum(quantity_unique_users) AS total_unique_users
          FROM music_analytics.${CLICKHOUSE_TABLES.FACT_DSP_COMPREHENSIVE_REPORT}
          WHERE toYYYYMM(reporting_period) = '${partition}'
          GROUP BY reporting_date, isrc
        `);

				this.logger.log(
					`Finished rebuilding trends partition: ${partition}`,
				);
			} catch (err) {
				this.logger.error(
					`Failed to rebuild trends partition ${partition}: ${err.message}`,
					err.stack,
				);
			}
		}
	}

	/**
	 * Full truncate and rebuild of sales cubes (original behavior from ExchangeRateService)
	 */
	async rebuildAllSalesCubes(): Promise<{
		dspRows: number;
		terRows: number;
		exportRows: number;
	}> {
		this.logger.log(
			'Executing full rebuild of all sales cubes (DSP + Territory + Export)...',
		);

		// 1. Truncate all 3 sales cubes
		await this.clickHouseService.execute(
			`TRUNCATE TABLE IF EXISTS music_analytics.${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY}`,
		);
		await this.clickHouseService.execute(
			`TRUNCATE TABLE IF EXISTS music_analytics.${CLICKHOUSE_TABLES.SALES_TER_MONTHLY}`,
		);
		await this.clickHouseService.execute(
			`TRUNCATE TABLE IF EXISTS music_analytics.${CLICKHOUSE_TABLES.SALES_EXPORT_MONTHLY}`,
		);

		// 2. Rebuild DSP cube
		await this.clickHouseService.execute(`
      INSERT INTO music_analytics.${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY}
      SELECT
          toStartOfMonth(f.reporting_period_start) AS period,
          f.dsp_id,
          f.isrc,
          if(f.import_source = '', 'ftp', f.import_source) AS import_source,
          sum(f.quantity) AS total_quantity,
          ${REVENUE_USD_EXPRESSION} AS total_revenue_usd
      FROM music_analytics.${CLICKHOUSE_TABLES.FACT_SALES_REPORT} f
      LEFT JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.EXCHANGE_RATES} FINAL) er
          ON formatDateTime(f.reporting_period_start, '%Y-%m') = er.rate_month
          AND f.revenue_currency = er.currency
      GROUP BY period, f.dsp_id, f.isrc, import_source
    `);

		// 3. Rebuild Territory cube
		await this.clickHouseService.execute(`
      INSERT INTO music_analytics.${CLICKHOUSE_TABLES.SALES_TER_MONTHLY}
      SELECT
          toStartOfMonth(f.reporting_period_start) AS period,
          f.territory_code,
          f.isrc,
          if(f.import_source = '', 'ftp', f.import_source) AS import_source,
          sum(f.quantity) AS total_quantity,
          ${REVENUE_USD_EXPRESSION} AS total_revenue_usd
      FROM music_analytics.${CLICKHOUSE_TABLES.FACT_SALES_REPORT} f
      LEFT JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.EXCHANGE_RATES} FINAL) er
          ON formatDateTime(f.reporting_period_start, '%Y-%m') = er.rate_month
          AND f.revenue_currency = er.currency
      GROUP BY period, f.territory_code, f.isrc, import_source
    `);

		// 4. Rebuild Export cube (was MISSING before — root cause of revenue mismatch)
		await this.clickHouseService.execute(`
      INSERT INTO music_analytics.${CLICKHOUSE_TABLES.SALES_EXPORT_MONTHLY}
      SELECT
          toStartOfMonth(f.reporting_period_start) AS period,
          f.dsp_id,
          f.territory_code,
          f.isrc,
          any(f.upc) AS upc,
          any(f.track_title) AS track_title,
          any(f.album_title) AS album_title,
          any(f.artist_name) AS artist_name,
          any(f.label_name) AS label_name,
          sum(f.quantity) AS total_usage,
          ${REVENUE_USD_EXPRESSION} AS revenue_usd
      FROM music_analytics.${CLICKHOUSE_TABLES.FACT_SALES_REPORT} f
      LEFT JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.EXCHANGE_RATES} FINAL) er
          ON formatDateTime(f.reporting_period_start, '%Y-%m') = er.rate_month
          AND f.revenue_currency = er.currency
      GROUP BY period, f.dsp_id, f.territory_code, f.isrc
    `);

		const dspCount = await this.clickHouseService.query<{ cnt: string }>(
			`SELECT count() AS cnt FROM music_analytics.${CLICKHOUSE_TABLES.SALES_DSP_MONTHLY}`,
		);
		const terCount = await this.clickHouseService.query<{ cnt: string }>(
			`SELECT count() AS cnt FROM music_analytics.${CLICKHOUSE_TABLES.SALES_TER_MONTHLY}`,
		);
		const exportCount = await this.clickHouseService.query<{ cnt: string }>(
			`SELECT count() AS cnt FROM music_analytics.${CLICKHOUSE_TABLES.SALES_EXPORT_MONTHLY}`,
		);

		const dspRows = Number(dspCount[0]?.cnt ?? 0);
		const terRows = Number(terCount[0]?.cnt ?? 0);
		const exportRows = Number(exportCount[0]?.cnt ?? 0);

		this.logger.log(
			`✅ Full rebuild complete — DSP: ${dspRows} rows, Territory: ${terRows} rows, Export: ${exportRows} rows`,
		);

		return { dspRows, terRows, exportRows };
	}
}
