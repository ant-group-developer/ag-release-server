import { Injectable, Logger } from '@nestjs/common';
import { ClickHouseService } from 'src/modules/clickhouse/clickhouse.service';
import { CLICKHOUSE_TABLES } from 'src/modules/clickhouse/clickhouse.constants';
import { v4 as uuidv4 } from 'uuid';
import { DspMappingService } from 'src/modules/dsp/services/dsp-mapping.service';

export interface DspsReportResponse {
  idDspsReport: string;
  pgUuid: string | null;
  dspName: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  pgDspsSync?: {
    pgUuid: string;
    dspCode: string;
    dspName: string;
    dspCiCode: string;
    picture: string;
    createdAt: string;
    updatedAt: string;
  } | null;
}

export function mapRawDspsReport(row: any): DspsReportResponse {
  const pgDspsSync = row.pg_dsps_sync_pg_uuid
    ? {
        pgUuid: row.pg_dsps_sync_pg_uuid,
        dspCode: row.pg_dsps_sync_dsp_code,
        dspName: row.pg_dsps_sync_dsp_name,
        dspCiCode: row.pg_dsps_sync_dsp_ci_code,
        picture: row.pg_dsps_sync_picture || '',
        createdAt: row.pg_dsps_sync_created_at,
        updatedAt: row.pg_dsps_sync_updated_at,
      }
    : null;

  return {
    idDspsReport: row.id_dsps_report,
    pgUuid: row.pg_uuid || null,
    dspName: row.dsp_name,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    pgDspsSync,
  };
}

@Injectable()
export class DspReportService {
  private readonly logger = new Logger(DspReportService.name);

  constructor(
    private readonly clickHouseService: ClickHouseService,
    private readonly dspMappingService: DspMappingService,
  ) {}

  /**
   * Get paginated dsps_report records with optional filtering
   */
  async findAll(query: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    status?: string;
  }): Promise<{ items: DspsReportResponse[]; totalItems: number }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    // Status filter
    if (query.status === 'assigned') {
      conditions.push(`r.pg_uuid != ''`);
    } else if (query.status === 'unassigned') {
      conditions.push(`r.pg_uuid = ''`);
    }

    // Keyword search (search in dsp_name and source)
    if (query.keyword) {
      conditions.push(`(lower(r.dsp_name) LIKE {kw: String} OR lower(r.source) LIKE {kw: String})`);
      params.kw = `%${query.keyword.toLowerCase()}%`;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count query
    const countRows = await this.clickHouseService.query<{ c: string }>(
      `SELECT count() AS c
       FROM ${CLICKHOUSE_TABLES.DSPS_REPORT} r
       ${whereClause}`,
      params,
    );
    const totalItems = Number(countRows[0]?.c ?? 0);

    // Data query with pagination
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
       LEFT JOIN ${CLICKHOUSE_TABLES.PG_DSPS_SYNC} p ON r.pg_uuid = p.pg_uuid
       ${whereClause}
       ORDER BY r.created_at DESC
       LIMIT ${pageSize} OFFSET ${offset}`,
      params,
    );

    return {
      items: rows.map(mapRawDspsReport),
      totalItems,
    };
  }

  /**
   * Get dsps_report by id
   */
  async findById(id: string): Promise<DspsReportResponse | null> {
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
       LEFT JOIN ${CLICKHOUSE_TABLES.PG_DSPS_SYNC} p ON r.pg_uuid = p.pg_uuid
       WHERE r.id_dsps_report = {id: String}`,
      { id }
    );
    return rows.length > 0 ? mapRawDspsReport(rows[0]) : null;
  }

  /**
   * Get dsps_reports by pg_uuid
   */
  async findByPgUuid(pgUuid: string): Promise<DspsReportResponse[]> {
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
  async create(dspName: string, source: string): Promise<DspsReportResponse> {
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
    this.logger.log(`Created dsps_report: ${idDspsReport} - ${dspName}`);

    return {
      idDspsReport,
      pgUuid: null,
      dspName,
      source,
      createdAt: now,
      updatedAt: now,
      pgDspsSync: null,
    };
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
      `ALTER TABLE ${CLICKHOUSE_TABLES.DSPS_REPORT} UPDATE pg_uuid = '' WHERE id_dsps_report = {id: String}`,
      { id: idDspsReport }
    );
    this.logger.log(`Unassigned dsps_report ${idDspsReport}`);
  }

  /**
   * Delete dsps_report by id
   */
  async delete(idDspsReport: string): Promise<void> {
    await this.clickHouseService.query(
      `ALTER TABLE ${CLICKHOUSE_TABLES.DSPS_REPORT} DELETE WHERE id_dsps_report = {id: String}`,
      { id: idDspsReport }
    );
    this.logger.log(`Deleted dsps_report ${idDspsReport}`);
    await this.dspMappingService.loadCache();
  }
}