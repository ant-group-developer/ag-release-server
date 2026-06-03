import { Injectable, Logger } from '@nestjs/common';
import { ClickHouseService } from '../../clickhouse/clickhouse.service';
import { CLICKHOUSE_TABLES } from '../../clickhouse/clickhouse.constants';
import { v4 as uuidv4 } from 'uuid';

export interface DspsReport {
  id_dsps_report: string;
  pg_uuid: string | null;
  dsp_name: string;
  source: string;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class DspMappingService {
  private readonly logger = new Logger(DspMappingService.name);
  private dspsReportCache: Map<string, string> = new Map(); // dsp_name (lowercase) -> id_dsps_report

  constructor(private readonly clickHouseService: ClickHouseService) {}

  /**
   * Resolve or create a dsps_report entry
   * @param input - DSP name from folder/file/report (e.g., 'aud-audiomack', 'Audiomack (WMG)')
   * @param source - Source type: 'ftp_folder', 'ci_report', 'excel_report', etc.
   * @returns The dsps_report record with id_dsps_report
   */
  async resolveOrCreateDspReport(input: string, source: string): Promise<DspsReport> {
    const normalizedInput = input.toLowerCase().trim();

    // Try to find existing by dsp_name
    const existing = await this.findByDspName(normalizedInput);
    if (existing) {
      this.logger.debug(`Found existing dsps_report for '${input}': ${existing.id_dsps_report}`);
      return existing;
    }

    // Create new dsps_report
    return this.createDspReport(input, source);
  }

  /**
   * Find dsps_report by dsp_name (case-insensitive)
   */
  private async findByDspName(dspName: string): Promise<DspsReport | null> {
    // Check cache first
    const cached = this.dspsReportCache.get(dspName);
    if (cached) {
      const rows = await this.clickHouseService.query<DspsReport>(
        `SELECT id_dsps_report, pg_uuid, dsp_name, source, created_at, updated_at
         FROM ${CLICKHOUSE_TABLES.DSPS_REPORT}
         WHERE id_dsps_report = {id: String}`,
        { id: cached }
      );
      return rows.length > 0 ? rows[0] : null;
    }

    // Query by dsp_name (case-insensitive)
    const rows = await this.clickHouseService.query<DspsReport>(
      `SELECT id_dsps_report, pg_uuid, dsp_name, source, created_at, updated_at
       FROM ${CLICKHOUSE_TABLES.DSPS_REPORT}
       WHERE lower(dsp_name) = {name: String}
       LIMIT 1`,
      { name: dspName }
    );

    if (rows.length > 0) {
      this.dspsReportCache.set(dspName, rows[0].id_dsps_report);
      return rows[0];
    }

    return null;
  }

  /**
   * Create new dsps_report entry
   */
  private async createDspReport(dspName: string, source: string): Promise<DspsReport> {
    const idDspsReport = uuidv4();
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    const newRecord: Record<string, unknown> = {
      id_dsps_report: idDspsReport,
      pg_uuid: '',
      dsp_name: dspName,
      source: source,
      created_at: now,
      updated_at: now,
    };

    await this.clickHouseService.insert(CLICKHOUSE_TABLES.DSPS_REPORT, [newRecord]);

    // Update cache
    this.dspsReportCache.set(dspName.toLowerCase(), idDspsReport);

    this.logger.log(`Created new dsps_report for '${dspName}': ${idDspsReport}`);
    return newRecord as unknown as DspsReport;
  }

  /**
   * Get dsps_report by id
   */
  async getDspsReportById(id: string): Promise<DspsReport | null> {
    const rows = await this.clickHouseService.query<DspsReport>(
      `SELECT id_dsps_report, pg_uuid, dsp_name, source, created_at, updated_at
       FROM ${CLICKHOUSE_TABLES.DSPS_REPORT}
       WHERE id_dsps_report = {id: String}`,
      { id }
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
        { uuid: pgUuid }
      );
    }

    return this.clickHouseService.query<DspsReport>(
      `SELECT id_dsps_report, pg_uuid, dsp_name, source, created_at, updated_at
       FROM ${CLICKHOUSE_TABLES.DSPS_REPORT}
       ORDER BY created_at DESC`
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
       ORDER BY created_at DESC`
    );
  }

  /**
   * Assign dsps_report to a pg_dsps_sync
   */
  async assignToPgDspsSync(idDspsReport: string, pgUuid: string): Promise<void> {
    await this.clickHouseService.query(
      `ALTER TABLE ${CLICKHOUSE_TABLES.DSPS_REPORT} UPDATE pg_uuid = {pgUuid: String} WHERE id_dsps_report = {id: String}`,
      { pgUuid, id: idDspsReport }
    );
    this.logger.log(`Assigned dsps_report ${idDspsReport} to pg_uuid ${pgUuid}`);
  }

  /**
   * Get pg_dsps_sync by pg_uuid
   */
  async getPgDspsSyncByUuid(pgUuid: string): Promise<Record<string, unknown> | null> {
    const rows = await this.clickHouseService.query(
      `SELECT pg_uuid, dsp_code, dsp_name, dsp_ci_code, created_at, updated_at
       FROM ${CLICKHOUSE_TABLES.PG_DSPS_SYNC}
       WHERE pg_uuid = {uuid: String}`,
      { uuid: pgUuid }
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Get all pg_dsps_sync records
   */
  async getAllPgDspsSync(): Promise<Record<string, unknown>[]> {
    return this.clickHouseService.query(
      `SELECT pg_uuid, dsp_code, dsp_name, dsp_ci_code, created_at, updated_at
       FROM ${CLICKHOUSE_TABLES.PG_DSPS_SYNC}
       ORDER BY dsp_name ASC`
    );
  }

  /**
   * Load dsps_report cache for faster lookup
   */
  async loadCache(): Promise<void> {
    const rows = await this.clickHouseService.query<{ dsp_name: string; id_dsps_report: string }>(
      `SELECT dsp_name, id_dsps_report FROM ${CLICKHOUSE_TABLES.DSPS_REPORT}`
    );
    this.dspsReportCache.clear();
    for (const row of rows) {
      this.dspsReportCache.set(row.dsp_name.toLowerCase(), row.id_dsps_report);
    }
    this.logger.log(`Loaded ${this.dspsReportCache.size} dsps_report entries into cache`);
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.dspsReportCache.clear();
  }
}