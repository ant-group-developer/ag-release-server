import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { ClickHouseMigrationService } from '../../clickhouse/clickhouse-migration.service';
import { CLICKHOUSE_TABLES } from '../../clickhouse/clickhouse.constants';
import { ClickHouseService } from '../../clickhouse/clickhouse.service';

export interface DspsReport {
	id_dsps_report: string;
	pg_uuid: string | null;
	dsp_name: string;
	source: string;
	created_at: string;
	updated_at: string;
}

@Injectable()
export class DspMappingService implements OnModuleInit {
	private readonly logger = new Logger(DspMappingService.name);
	private dspsReportCache: Map<string, DspsReport> = new Map(); // "dspName:source" -> DspsReport

	constructor(
		private readonly clickHouseService: ClickHouseService,
		private readonly clickHouseMigrationService: ClickHouseMigrationService,
	) {}

	onModuleInit() {
		this.initializeCacheInBackground().catch((err) => {
			this.logger.error(
				`Failed to load dsps_report cache during init: ${err.message}`,
				err.stack,
			);
		});
	}

	private async initializeCacheInBackground() {
		await this.clickHouseMigrationService.waitForMigrations();
		await this.loadCache();
	}

	/**
	 * Resolve or create a dsps_report entry
	 * @param input - DSP name from folder/file/report (e.g., 'aud-audiomack', 'Spotify')
	 * @param source - Source type: 'ftp_folder', 'wmg_report', 'spotify_report', etc.
	 * @returns The dsps_report record with id_dsps_report
	 * Note: Same dsp_name with different source values will create separate records
	 */
	async resolveOrCreateDspReport(
		input: string,
		source: string,
	): Promise<DspsReport> {
		const normalizedInput = input.toLowerCase().trim();

		// Try to find existing by dsp_name AND source
		const existing = await this.findByDspNameAndSource(normalizedInput, source);
		if (existing) {
			return existing;
		}

		// Create new dsps_report
		return this.createDspReport(input, source);
	}

	/**
	 * Find dsps_report by dsp_name (case-insensitive) AND source
	 * Each (dsp_name, source) pair is unique
	 */
	private async findByDspNameAndSource(
		dspName: string,
		source: string,
	): Promise<DspsReport | null> {
		// Check cache first (key = "dspName:source")
		const cacheKey = `${dspName}:${source}`;
		const cached = this.dspsReportCache.get(cacheKey);
		if (cached) {
			return cached;
		}

		// Query by dsp_name (case-insensitive) AND source
		const rows = await this.clickHouseService.query<DspsReport>(
			`SELECT id_dsps_report, pg_uuid, dsp_name, source, created_at, updated_at
	       FROM ${CLICKHOUSE_TABLES.DSPS_REPORT}
	       WHERE lower(dsp_name) = {name: String} AND source = {source: String}
	       LIMIT 1`,
			{ name: dspName, source },
		);

		if (rows.length > 0) {
			this.dspsReportCache.set(cacheKey, rows[0]);
			return rows[0];
		}

		return null;
	}

	/**
	 * Create new dsps_report entry
	 */
	private async createDspReport(
		dspName: string,
		source: string,
	): Promise<DspsReport> {
		const idDspsReport = uuidv4();
		const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

		const newRecord: DspsReport = {
			id_dsps_report: idDspsReport,
			pg_uuid: '',
			dsp_name: dspName,
			source: source,
			created_at: now,
			updated_at: now,
		};

		await this.clickHouseService.insert(CLICKHOUSE_TABLES.DSPS_REPORT, [
			newRecord as any,
		]);

		// Update cache with (dspName:source) key
		this.dspsReportCache.set(`${dspName.toLowerCase()}:${source}`, newRecord);

		this.logger.log(
			`Created new dsps_report for '${dspName}' from source '${source}': ${idDspsReport}`,
		);
		return newRecord;
	}

	/**
	 * Get dsps_report by id
	 */
	async getDspsReportById(id: string): Promise<DspsReport | null> {
		const rows = await this.clickHouseService.query<DspsReport>(
			`SELECT id_dsps_report, pg_uuid, dsp_name, source, created_at, updated_at
	       FROM ${CLICKHOUSE_TABLES.DSPS_REPORT}
	       WHERE id_dsps_report = {id: String}`,
			{ id },
		);
		return rows.length > 0 ? rows[0] : null;
	}

	/**
	 * Get all dsps_reports (optionally filtered by pg_uuid)
	 */
	async getDspsReports(pgUuid?: string): Promise<DspsReport[]> {
		if (pgUuid) {
			return this.clickHouseService.query<DspsReport>(
				`SELECT id_dsps_report, pg_uuid, dsp_name, source, created_at, updated_at
	         FROM ${CLICKHOUSE_TABLES.DSPS_REPORT}
	         WHERE pg_uuid = {uuid: String}
	         ORDER BY created_at DESC`,
				{ uuid: pgUuid },
			);
		}

		return this.clickHouseService.query<DspsReport>(
			`SELECT id_dsps_report, pg_uuid, dsp_name, source, created_at, updated_at
	       FROM ${CLICKHOUSE_TABLES.DSPS_REPORT}
	       ORDER BY created_at DESC`,
		);
	}

	/**
	 * Get unassigned dsps_reports (pg_uuid is null)
	 */
	async getUnassignedDspsReports(): Promise<DspsReport[]> {
		return this.clickHouseService.query<DspsReport>(
			`SELECT id_dsps_report, pg_uuid, dsp_name, source, created_at, updated_at
	       FROM ${CLICKHOUSE_TABLES.DSPS_REPORT}
	       WHERE pg_uuid IS NULL
	       ORDER BY created_at DESC`,
		);
	}

	/**
	 * Assign dsps_report to a pg_dsps_sync
	 */
	async assignToPgDspsSync(
		idDspsReport: string,
		pgUuid: string,
	): Promise<void> {
		await this.clickHouseService.query(
			`ALTER TABLE ${CLICKHOUSE_TABLES.DSPS_REPORT} UPDATE pg_uuid = {pgUuid: String} WHERE id_dsps_report = {id: String}`,
			{ pgUuid, id: idDspsReport },
		);
		this.logger.log(
			`Assigned dsps_report ${idDspsReport} to pg_uuid ${pgUuid}`,
		);
	}

	/**
	 * Get pg_dsps_sync by pg_uuid
	 */
	async getPgDspsSyncByUuid(
		pgUuid: string,
	): Promise<Record<string, unknown> | null> {
		const rows = await this.clickHouseService.query(
			`SELECT pg_uuid, dsp_code, dsp_name, dsp_ci_code, type, created_at, updated_at
	       FROM ${CLICKHOUSE_TABLES.PG_DSPS_SYNC} FINAL
	       WHERE pg_uuid = {uuid: String}`,
			{ uuid: pgUuid },
		);
		return rows.length > 0 ? rows[0] : null;
	}

	/**
	 * Get all pg_dsps_sync records
	 */
	async getAllPgDspsSync(): Promise<Record<string, unknown>[]> {
		return this.clickHouseService.query(
			`SELECT pg_uuid, dsp_code, dsp_name, dsp_ci_code, created_at, updated_at
	       FROM ${CLICKHOUSE_TABLES.PG_DSPS_SYNC} FINAL
	       ORDER BY dsp_name ASC`,
		);
	}

	/**
	 * Load dsps_report cache for faster lookup
	 */
	async loadCache(): Promise<void> {
		const rows = await this.clickHouseService.query<DspsReport>(
			`SELECT id_dsps_report, pg_uuid, dsp_name, source, created_at, updated_at FROM ${CLICKHOUSE_TABLES.DSPS_REPORT} FINAL`,
		);
		this.dspsReportCache.clear();
		for (const row of rows) {
			// Cache key: "dspName:source" to support same DSP from different sources
			const cacheKey = `${row.dsp_name.toLowerCase()}:${row.source}`;
			this.dspsReportCache.set(cacheKey, row);
		}
		this.logger.log(
			`Loaded ${this.dspsReportCache.size} dsps_report entries into cache`,
		);
	}

	/**
	 * Clear cache
	 */
	clearCache(): void {
		this.dspsReportCache.clear();
	}
}
