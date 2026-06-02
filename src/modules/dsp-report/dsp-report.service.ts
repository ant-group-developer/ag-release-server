import { Injectable, Logger } from '@nestjs/common';
import { ClickHouseService } from 'src/modules/clickhouse/clickhouse.service';
import { CLICKHOUSE_TABLES } from 'src/modules/clickhouse/clickhouse.constants';
import { v4 as uuidv4 } from 'uuid';

export interface DspsReport {
  id_dsps_report: string;
  pg_uuid: string | null;
  dsp_name: string;
  source: string;
  created_at: string;
  updated_at: string;
  pgDspsSync?: {
    pg_uuid: string;
    dsp_code: string;
    dsp_name: string;
    dsp_ci_code: string;
    created_at: string;
    updated_at: string;
  } | null;
  pg_dsps_sync?: {
    pg_uuid: string;
    dsp_code: string;
    dsp_name: string;
    dsp_ci_code: string;
    created_at: string;
    updated_at: string;
  } | null;
}

export function mapRawDspsReport(row: any): DspsReport {
  const pgDspsSync = row.pg_dsps_sync_pg_uuid
    ? {
        pg_uuid: row.pg_dsps_sync_pg_uuid,
        dsp_code: row.pg_dsps_sync_dsp_code,
        dsp_name: row.pg_dsps_sync_dsp_name,
        dsp_ci_code: row.pg_dsps_sync_dsp_ci_code,
        created_at: row.pg_dsps_sync_created_at,
        updated_at: row.pg_dsps_sync_updated_at,
      }
    : null;

  return {
    id_dsps_report: row.id_dsps_report,
    pg_uuid: row.pg_uuid || null,
    dsp_name: row.dsp_name,
    source: row.source,
    created_at: row.created_at,
    updated_at: row.updated_at,
    pg_dsps_sync: pgDspsSync,
  };
}

@Injectable()
export class DspReportService {
  private readonly logger = new Logger(DspReportService.name);

  constructor(private readonly clickHouseService: ClickHouseService) {}

  /**
   * Get all dsps_report records
   */
  async findAll(): Promise<DspsReport[]> {
    const rows = await this.clickHouseService.query<any>(
      `SELECT
         r.id_dsps_report AS id_dsps_report,
         r.pg_uuid AS pg_uuid,
         r.dsp_name AS dsp_name,
         r.source AS source,
         r.created_at AS created_at,
         r.updated_at AS updated_at,
         p.pg_uuid AS pg_dsps_sync_pg_uuid,
         p.dsp_code AS pg_dsps_sync_dsp_code,
         p.dsp_name AS pg_dsps_sync_dsp_name,
         p.dsp_ci_code AS pg_dsps_sync_dsp_ci_code,
         p.created_at AS pg_dsps_sync_created_at,
         p.updated_at AS pg_dsps_sync_updated_at
       FROM ${CLICKHOUSE_TABLES.DSPS_REPORT} r
       LEFT JOIN ${CLICKHOUSE_TABLES.PG_DSPS_SYNC} p ON r.pg_uuid = p.pg_uuid
       ORDER BY r.created_at DESC`
    );
    return rows.map(mapRawDspsReport);
  }

  /**
   * Get dsps_report by id
   */
  async findById(id: string): Promise<DspsReport | null> {
    const rows = await this.clickHouseService.query<any>(
      `SELECT
         r.id_dsps_report AS id_dsps_report,
         r.pg_uuid AS pg_uuid,
         r.dsp_name AS dsp_name,
         r.source AS source,
         r.created_at AS created_at,
         r.updated_at AS updated_at,
         p.pg_uuid AS pg_dsps_sync_pg_uuid,
         p.dsp_code AS pg_dsps_sync_dsp_code,
         p.dsp_name AS pg_dsps_sync_dsp_name,
         p.dsp_ci_code AS pg_dsps_sync_dsp_ci_code,
         p.created_at AS pg_dsps_sync_created_at,
         p.updated_at AS pg_dsps_sync_updated_at
       FROM ${CLICKHOUSE_TABLES.DSPS_REPORT} r
       LEFT JOIN ${CLICKHOUSE_TABLES.PG_DSPS_SYNC} p ON r.pg_uuid = p.pg_uuid
       WHERE r.id_dsps_report = {id: String}`,
      { id }
    );
    return rows.length > 0 ? mapRawDspsReport(rows[0]) : null;
  }


  /**
   * Get dsps_reports by pg_uuid
   */
  async findByPgUuid(pgUuid: string): Promise<DspsReport[]> {
    const rows = await this.clickHouseService.query<any>(
      `SELECT
         r.id_dsps_report AS id_dsps_report,
         r.pg_uuid AS pg_uuid,
         r.dsp_name AS dsp_name,
         r.source AS source,
         r.created_at AS created_at,
         r.updated_at AS updated_at,
         p.pg_uuid AS pg_dsps_sync_pg_uuid,
         p.dsp_code AS pg_dsps_sync_dsp_code,
         p.dsp_name AS pg_dsps_sync_dsp_name,
         p.dsp_ci_code AS pg_dsps_sync_dsp_ci_code,
         p.created_at AS pg_dsps_sync_created_at,
         p.updated_at AS pg_dsps_sync_updated_at
       FROM ${CLICKHOUSE_TABLES.DSPS_REPORT} r
       LEFT JOIN ${CLICKHOUSE_TABLES.PG_DSPS_SYNC} p ON r.pg_uuid = p.pg_uuid
       WHERE r.pg_uuid = {pgUuid: String}
       ORDER BY r.created_at DESC`,
      { pgUuid }
    );
    return rows.map(mapRawDspsReport);
  }

  /**
   * Create new dsps_report
   */
  async create(dspName: string, source: string): Promise<DspsReport> {
    const idDspsReport = uuidv4();
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    const newRecord: Record<string, unknown> = {
      id_dsps_report: idDspsReport,
      pg_uuid: null,
      dsp_name: dspName,
      source: source,
      created_at: now,
      updated_at: now,
    };

    await this.clickHouseService.insert(CLICKHOUSE_TABLES.DSPS_REPORT, [newRecord]);
    this.logger.log(`Created dsps_report: ${idDspsReport} - ${dspName}`);
    return newRecord as unknown as DspsReport;
  }

  /**
   * Assign dsps_report to pg_dsps_sync
   */
  async assignToPgDspsSync(idDspsReport: string, pgUuid: string): Promise<void> {
    await this.clickHouseService.query(
      `ALTER TABLE ${CLICKHOUSE_TABLES.DSPS_REPORT} UPDATE pg_uuid = {pgUuid: String} WHERE id_dsps_report = {id: String}`,
      { pgUuid, id: idDspsReport }
    );
    this.logger.log(`Assigned dsps_report ${idDspsReport} → pg_uuid ${pgUuid}`);
  }

  /**
   * Unassign dsps_report from pg_dsps_sync
   */
  async unassign(idDspsReport: string): Promise<void> {
    await this.clickHouseService.query(
      `ALTER TABLE ${CLICKHOUSE_TABLES.DSPS_REPORT} UPDATE pg_uuid = NULL WHERE id_dsps_report = {id: String}`,
      { id: idDspsReport }
    );
    this.logger.log(`Unassigned dsps_report ${idDspsReport}`);
  }
}