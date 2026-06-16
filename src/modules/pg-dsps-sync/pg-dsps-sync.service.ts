import { Injectable, Logger } from '@nestjs/common';
import { ClickHouseService } from 'src/modules/clickhouse/clickhouse.service';
import { CLICKHOUSE_TABLES } from 'src/modules/clickhouse/clickhouse.constants';
import { mapRawDspsReport, DspsReportResponse } from '../dsp-report/services/dsp-report.service';

export interface PgDspsSyncResponse {
  pgUuid: string;
  dspCode: string;
  dspName: string;
  dspCiCode: string;
  picture: string;
  createdAt: string;
  updatedAt: string;
}

function mapRawPgDspsSync(row: any): PgDspsSyncResponse {
  return {
    pgUuid: row.pg_uuid,
    dspCode: row.dsp_code,
    dspName: row.dsp_name,
    dspCiCode: row.dsp_ci_code,
    picture: row.picture || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

@Injectable()
export class PgDspsSyncService {
  private readonly logger = new Logger(PgDspsSyncService.name);

  constructor(private readonly clickHouseService: ClickHouseService) { }

  /**
   * Get paginated pg_dsps_sync records
   */
  async findAll(query: {
    page?: number;
    pageSize?: number;
    keyword?: string;
  }): Promise<{ items: PgDspsSyncResponse[]; totalItems: number }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    // Keyword search (search in dsp_name, dsp_code, dsp_ci_code)
    if (query.keyword) {
      conditions.push(
        `(dsp_name ILIKE {kw:String} OR dsp_code ILIKE {kw:String} OR dsp_ci_code ILIKE {kw:String})`,
      );
      params.kw = `%${query.keyword}%`;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count query
    const countRows = await this.clickHouseService.query<{ c: string }>(
      `SELECT count() AS c
       FROM ${CLICKHOUSE_TABLES.PG_DSPS_SYNC} FINAL
       ${whereClause}`,
      params,
    );
    const totalItems = Number(countRows[0]?.c ?? 0);

    // Data query with pagination
    const rows = await this.clickHouseService.query<any>(
      `SELECT pg_uuid, dsp_code, dsp_name, dsp_ci_code, picture, created_at, updated_at
       FROM ${CLICKHOUSE_TABLES.PG_DSPS_SYNC} FINAL
       ${whereClause}
       ORDER BY lower(substring(dsp_name, 1, 1)) ASC, lower(dsp_name) ASC, dsp_name ASC
       LIMIT ${pageSize} OFFSET ${offset}`,
      params,
    );

    return {
      items: rows.map(mapRawPgDspsSync),
      totalItems,
    };
  }

  /**
   * Get pg_dsps_sync by pg_uuid
   */
  async findByUuid(pgUuid: string): Promise<PgDspsSyncResponse | null> {
    const rows = await this.clickHouseService.query<any>(
      `SELECT pg_uuid, dsp_code, dsp_name, dsp_ci_code, picture, created_at, updated_at
       FROM ${CLICKHOUSE_TABLES.PG_DSPS_SYNC} FINAL
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
         p.picture AS pg_dsps_sync_picture,
         p.created_at AS pg_dsps_sync_created_at,
         p.updated_at AS pg_dsps_sync_updated_at
       FROM ${CLICKHOUSE_TABLES.DSPS_REPORT} r
       LEFT JOIN (SELECT * FROM ${CLICKHOUSE_TABLES.PG_DSPS_SYNC} FINAL) p ON r.pg_uuid = p.pg_uuid
       WHERE r.pg_uuid = {uuid: String}
       ORDER BY r.created_at DESC`,
      { uuid: pgUuid }
    );
    return rows.map(mapRawDspsReport);
  }
}
