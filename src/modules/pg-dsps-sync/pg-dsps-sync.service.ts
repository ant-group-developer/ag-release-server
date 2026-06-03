import { Injectable, Logger } from '@nestjs/common';
import { ClickHouseService } from 'src/modules/clickhouse/clickhouse.service';
import { CLICKHOUSE_TABLES } from 'src/modules/clickhouse/clickhouse.constants';
import { mapRawDspsReport, DspsReportResponse } from '../dsp-report/dsp-report.service';

export interface PgDspsSyncResponse {
  pgUuid: string;
  dspCode: string;
  dspName: string;
  dspCiCode: string;
  createdAt: string;
  updatedAt: string;
}

function mapRawPgDspsSync(row: any): PgDspsSyncResponse {
  return {
    pgUuid: row.pg_uuid,
    dspCode: row.dsp_code,
    dspName: row.dsp_name,
    dspCiCode: row.dsp_ci_code,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

@Injectable()
export class PgDspsSyncService {
  private readonly logger = new Logger(PgDspsSyncService.name);

  constructor(private readonly clickHouseService: ClickHouseService) {}

  /**
   * Get all pg_dsps_sync records
   */
  async findAll(): Promise<PgDspsSyncResponse[]> {
    const rows = await this.clickHouseService.query<any>(
      `SELECT pg_uuid, dsp_code, dsp_name, dsp_ci_code, created_at, updated_at
       FROM ${CLICKHOUSE_TABLES.PG_DSPS_SYNC}
       ORDER BY dsp_name ASC`
    );
    return rows.map(mapRawPgDspsSync);
  }

  /**
   * Get pg_dsps_sync by pg_uuid
   */
  async findByUuid(pgUuid: string): Promise<PgDspsSyncResponse | null> {
    const rows = await this.clickHouseService.query<any>(
      `SELECT pg_uuid, dsp_code, dsp_name, dsp_ci_code, created_at, updated_at
       FROM ${CLICKHOUSE_TABLES.PG_DSPS_SYNC}
       WHERE pg_uuid = {uuid: String}`,
      { uuid: pgUuid }
    );
    return rows.length > 0 ? mapRawPgDspsSync(rows[0]) : null;
  }

  /**
   * Get dsps_reports for a specific pg_uuid
   */
  async getDspsReports(pgUuid: string): Promise<DspsReportResponse[]> {
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
       WHERE r.pg_uuid = {uuid: String}
       ORDER BY r.created_at DESC`,
      { uuid: pgUuid }
    );
    return rows.map(mapRawDspsReport);
  }
}