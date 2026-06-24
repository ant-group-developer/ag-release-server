import { Injectable, Logger } from '@nestjs/common';
import { ClickHouseService } from 'src/modules/clickhouse/clickhouse.service';
import { CLICKHOUSE_TABLES } from 'src/modules/clickhouse/clickhouse.constants';
import { v4 as uuidv4 } from 'uuid';
import { DspMappingService } from 'src/modules/dsp/services/dsp-mapping.service';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager, In } from 'typeorm';
import { ReportEntityExtractorService, ExtractedRow } from 'src/modules/release/services/report-entity-extractor.service';
import { Dsp } from 'src/modules/dsp/entities/dsp.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { Video } from 'src/modules/video/entities/video.entity';
import { normalizeUpc, buildEquivalentUpcs, normalizeReportUpcOrFallback } from 'src/utils/upc.util';
import { hasMeaningfulText } from 'src/modules/etl/utils/fact-row-normalizer.util';

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
  totalReleasesCount?: number;
  pendingReleasesCount?: number;
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
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
    private readonly reportEntityExtractorService: ReportEntityExtractorService,
  ) {}

  /**
   * Get paginated dsps_report records with optional filtering
   */
  async findAll(query: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    status?: string;
    fieldOrder?: string;
    orderBy?: string;
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

    // Keyword search (search in dsps_report and assigned pg_dsps_sync fields)
    if (query.keyword) {
      conditions.push(`(
        r.dsp_name ILIKE {kw:String}
        OR r.source ILIKE {kw:String}
        OR p.dsp_name ILIKE {kw:String}
        OR p.dsp_code ILIKE {kw:String}
        OR p.dsp_ci_code ILIKE {kw:String}
      )`);
      params.kw = `%${query.keyword}%`;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count query
    const countRows = await this.clickHouseService.query<{ c: string }>(
      `SELECT count() AS c
       FROM ${CLICKHOUSE_TABLES.DSPS_REPORT} r FINAL
       LEFT JOIN (SELECT * FROM ${CLICKHOUSE_TABLES.PG_DSPS_SYNC} FINAL) p ON r.pg_uuid = p.pg_uuid
       ${whereClause}`,
      params,
    );
    const totalItems = Number(countRows[0]?.c ?? 0);

    // Sorting options (default to dsp_name ASC)
    const allowedSortFields: Record<string, string> = {
      name: 'r.dsp_name',
      dspName: 'r.dsp_name',
      source: 'r.source',
      createdAt: 'r.created_at',
      created_at: 'r.created_at',
      updatedAt: 'r.updated_at',
      updated_at: 'r.updated_at',
    };

    const fieldOrder = query.fieldOrder && allowedSortFields[query.fieldOrder]
      ? allowedSortFields[query.fieldOrder]
      : 'r.dsp_name';

    const orderBy = query.orderBy && ['ASC', 'DESC'].includes(query.orderBy.toUpperCase())
      ? query.orderBy.toUpperCase()
      : 'ASC';

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
       FROM ${CLICKHOUSE_TABLES.DSPS_REPORT} r FINAL
       LEFT JOIN (SELECT * FROM ${CLICKHOUSE_TABLES.PG_DSPS_SYNC} FINAL) p ON r.pg_uuid = p.pg_uuid
       ${whereClause}
       ORDER BY ${fieldOrder} ${orderBy}
       LIMIT ${pageSize} OFFSET ${offset}`,
      params,
    );

     const items = rows.map(mapRawDspsReport);

    // Fetch stats for each report on the current page
    await Promise.all(
      items.map(async (item) => {
        const stats = await this.getImportStats(item.idDspsReport);
        item.totalReleasesCount = stats.totalReleasesCount;
        item.pendingReleasesCount = stats.pendingReleasesCount;
      })
    );

    return {
      items,
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
       FROM ${CLICKHOUSE_TABLES.DSPS_REPORT} r FINAL
       LEFT JOIN (SELECT * FROM ${CLICKHOUSE_TABLES.PG_DSPS_SYNC} FINAL) p ON r.pg_uuid = p.pg_uuid
       WHERE r.id_dsps_report = {id: String}`,
      { id }
    );
    if (rows.length === 0) return null;
    const response = mapRawDspsReport(rows[0]);
    const stats = await this.getImportStats(id);
    response.totalReleasesCount = stats.totalReleasesCount;
    response.pendingReleasesCount = stats.pendingReleasesCount;
    return response;
  }

  /**
   * Calculate stats of unique releases in ClickHouse raw metadata vs what is already imported in Postgres
   */
  async getImportStats(idDspsReport: string): Promise<{ totalReleasesCount: number; pendingReleasesCount: number }> {
    // 1. Resolve dspType
    let dspType = 'audio';
    const reportRows = await this.clickHouseService.query<{ pg_uuid: string }>(
      `SELECT pg_uuid FROM ${CLICKHOUSE_TABLES.DSPS_REPORT} FINAL WHERE id_dsps_report = {id: String}`,
      { id: idDspsReport }
    );
    if (reportRows.length > 0 && reportRows[0].pg_uuid) {
      const dsp = await this.entityManager.findOne(Dsp, { where: { id: reportRows[0].pg_uuid } });
      if (dsp) {
        dspType = dsp.type;
      }
    }

    // 2. Query ClickHouse for upc and isrc
    const clickHouseRows = await this.clickHouseService.query<{ upc: string; isrc: string }>(
      `
        SELECT trimBoth(toString(upc)) AS upc, trimBoth(toString(isrc)) AS isrc
        FROM (
          SELECT upc, isrc FROM music_analytics.fact_sales_report WHERE dsp_id = {dspId: String} AND (trimBoth(toString(upc)) != '' OR trimBoth(toString(isrc)) != '')
          UNION ALL
          SELECT upc, isrc FROM music_analytics.fact_dsp_comprehensive_report WHERE dsp_id = {dspId: String} AND (trimBoth(toString(upc)) != '' OR trimBoth(toString(isrc)) != '')
        )
      `,
      { dspId: idDspsReport }
    );

    if (clickHouseRows.length === 0) {
      return { totalReleasesCount: 0, pendingReleasesCount: 0 };
    }

    // 3. Group rows into releases like extractAndImport does
    const upcMap = new Map<string, Set<string>>(); // Map<upc, Set<isrc>>
    for (const row of clickHouseRows) {
      const isrc = hasMeaningfulText(row.isrc) ? row.isrc.trim() : '';
      let upc = normalizeReportUpcOrFallback(hasMeaningfulText(row.upc) ? row.upc.trim() : '', isrc);

      if (!isrc && !upc) continue;

      if (!upc && isrc) {
        upc = `ISRC-${isrc}`;
      }

      if (!upcMap.has(upc)) {
        upcMap.set(upc, new Set());
      }
      if (isrc) {
        upcMap.get(upc)!.add(isrc);
      }
    }

    const totalReleasesCount = upcMap.size;
    if (totalReleasesCount === 0) {
      return { totalReleasesCount: 0, pendingReleasesCount: 0 };
    }

    // 4. Fetch existing releases in Postgres
    let existingUpcs = new Set<string>();
    const allGroupedUpcs = Array.from(upcMap.keys());
    const normalizedUpcs = allGroupedUpcs.map((u) => normalizeUpc(u)).filter(Boolean);
    if (normalizedUpcs.length > 0) {
      const equivalentUpcsSet = new Set<string>();
      for (const u of normalizedUpcs) {
        const equivalents = buildEquivalentUpcs(u);
        for (const eq of equivalents) {
          equivalentUpcsSet.add(eq);
        }
      }
      const allEquivalentUpcs = Array.from(equivalentUpcsSet);

      const existingReleases = await this.entityManager.find(Release, {
        where: { upc: In(allEquivalentUpcs) },
        select: ['upc'],
      });
      existingUpcs = new Set(existingReleases.map((r) => normalizeUpc(r.upc)).filter(Boolean));
    }

    // 5. Fetch existing tracks/videos in Postgres
    let existingIsrcs = new Set<string>();
    const allIsrcs = new Set<string>();
    for (const isrcSet of upcMap.values()) {
      for (const isrc of isrcSet) {
        allIsrcs.add(isrc);
      }
    }
    const allIsrcsList = Array.from(allIsrcs);

    if (allIsrcsList.length > 0) {
      if (dspType === 'video') {
        const existingVideos = await this.entityManager.find(Video, {
          where: { isrc: In(allIsrcsList) },
          select: ['isrc'],
        });
        existingIsrcs = new Set(existingVideos.map((v) => v.isrc).filter((isrc): isrc is string => !!isrc));
      } else {
        const existingTracks = await this.entityManager.find(Track, {
          where: { isrc: In(allIsrcsList) },
          select: ['isrc'],
        });
        existingIsrcs = new Set(existingTracks.map((t) => t.isrc).filter((isrc): isrc is string => !!isrc));
      }
    }

    // 6. Calculate pending count
    let pendingReleasesCount = 0;
    for (const [upc, isrcSet] of upcMap.entries()) {
      const hasUpc = !!upc;
      const upcExists = hasUpc && existingUpcs.has(normalizeUpc(upc));

      let isrcExists = false;
      for (const isrc of isrcSet) {
        if (existingIsrcs.has(isrc)) {
          isrcExists = true;
          break;
        }
      }

      if (!upcExists && !isrcExists) {
        pendingReleasesCount++;
      }
    }

    return {
      totalReleasesCount,
      pendingReleasesCount,
    };
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
       FROM ${CLICKHOUSE_TABLES.DSPS_REPORT} r FINAL
       LEFT JOIN (SELECT * FROM ${CLICKHOUSE_TABLES.PG_DSPS_SYNC} FINAL) p ON r.pg_uuid = p.pg_uuid
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
    await this.dspMappingService.loadCache();

    // Sync metadata from Clickhouse raw tables to PostgreSQL
    try {
      const dsp = await this.entityManager.findOne(Dsp, { where: { id: pgUuid } });
      const dspType = dsp?.type || 'audio';

      this.logger.log(`Scanning raw metadata from ClickHouse for dsp_id ${idDspsReport} (DSP type: ${dspType})...`);

      const rawMetadataRows = await this.clickHouseService.query<ExtractedRow>(
        `
          SELECT
            isrc,
            upc,
            argMax(track_title, score) AS track_title,
            argMax(artist_name, score) AS artist_name,
            argMax(album_title, score) AS album_title,
            argMax(label_name, score) AS label_name
          FROM (
            SELECT
              trimBoth(toString(isrc)) AS isrc,
              trimBoth(toString(upc)) AS upc,
              trimBoth(toString(track_title)) AS track_title,
              trimBoth(toString(artist_name)) AS artist_name,
              trimBoth(toString(album_title)) AS album_title,
              trimBoth(toString(label_name)) AS label_name,
              if(track_title != '' AND track_title != 'N/A', 1, 0)
                + if(artist_name != '' AND artist_name != 'N/A', 1, 0)
                + if(album_title != '' AND album_title != 'N/A', 1, 0)
                + if(label_name != '' AND label_name != 'N/A', 1, 0) AS score
            FROM music_analytics.fact_sales_report
            WHERE dsp_id = {dspId: String}
              AND (trimBoth(toString(isrc)) != '' OR trimBoth(toString(upc)) != '')

            UNION ALL

            SELECT
              trimBoth(toString(isrc)) AS isrc,
              trimBoth(toString(upc)) AS upc,
              trimBoth(toString(track_title)) AS track_title,
              trimBoth(toString(artist_name)) AS artist_name,
              trimBoth(toString(album_title)) AS album_title,
              trimBoth(toString(label_name)) AS label_name,
              if(track_title != '' AND track_title != 'N/A', 1, 0)
                + if(artist_name != '' AND artist_name != 'N/A', 1, 0)
                + if(album_title != '' AND album_title != 'N/A', 1, 0)
                + if(label_name != '' AND label_name != 'N/A', 1, 0) AS score
            FROM music_analytics.fact_dsp_comprehensive_report
            WHERE dsp_id = {dspId: String}
              AND (trimBoth(toString(isrc)) != '' OR trimBoth(toString(upc)) != '')
          )
          GROUP BY upc, isrc
        `,
        { dspId: idDspsReport }
      );

      if (rawMetadataRows.length > 0) {
        const upcs = rawMetadataRows.map((r) => {
          const isrc = hasMeaningfulText(r.isrc) ? r.isrc!.trim() : '';
          let upc = normalizeReportUpcOrFallback(hasMeaningfulText(r.upc) ? r.upc!.trim() : '', isrc);
          if (!upc && isrc) {
            upc = `ISRC-${isrc}`;
          }
          return upc;
        }).filter((x): x is string => !!x);
        const isrcs = rawMetadataRows.map((r) => r.isrc).filter((x): x is string => !!x);

        let existingUpcs = new Set<string>();
        let existingIsrcs = new Set<string>();

        if (upcs.length > 0) {
          const normalizedUpcs = upcs.map((u) => normalizeUpc(u));
          const equivalentUpcsSet = new Set<string>();
          for (const u of normalizedUpcs) {
            const equivalents = buildEquivalentUpcs(u);
            for (const eq of equivalents) {
              equivalentUpcsSet.add(eq);
            }
          }
          const allEquivalentUpcs = Array.from(equivalentUpcsSet);

          const existingReleases = await this.entityManager.find(Release, {
            where: { upc: In(allEquivalentUpcs) },
            select: ['upc'],
          });
          existingUpcs = new Set(existingReleases.map((r) => normalizeUpc(r.upc)).filter(Boolean));
        }

        if (isrcs.length > 0) {
          if (dspType === 'video') {
            const existingVideos = await this.entityManager.find(Video, {
              where: { isrc: In(isrcs) },
              select: ['isrc'],
            });
            existingIsrcs = new Set(existingVideos.map((v) => v.isrc).filter((isrc): isrc is string => !!isrc));
          } else {
            const existingTracks = await this.entityManager.find(Track, {
              where: { isrc: In(isrcs) },
              select: ['isrc'],
            });
            existingIsrcs = new Set(existingTracks.map((t) => t.isrc).filter((isrc): isrc is string => !!isrc));
          }
        }

        const filteredRows = rawMetadataRows.filter((row) => {
          const isrc = hasMeaningfulText(row.isrc) ? row.isrc!.trim() : '';
          let upc = normalizeReportUpcOrFallback(hasMeaningfulText(row.upc) ? row.upc!.trim() : '', isrc);
          if (!isrc && !upc) return false;
          if (!upc && isrc) {
            upc = `ISRC-${isrc}`;
          }

          const hasUpc = !!upc;
          const hasIsrc = !!isrc;

          const upcExists = hasUpc && existingUpcs.has(normalizeUpc(upc));
          const isrcExists = hasIsrc && existingIsrcs.has(isrc);

          return !upcExists && !isrcExists;
        });

        if (filteredRows.length > 0) {
          this.logger.log(
            `Found ${filteredRows.length} new metadata rows to import for dsp_id ${idDspsReport} (DSP type: ${dspType})`,
          );
          await this.reportEntityExtractorService.extractAndImport(
            filteredRows,
            undefined,
            undefined,
            undefined,
            {
              sourceType: 'dsp_assignment_sync',
              jobId: idDspsReport,
              dspType,
            },
          );
        } else {
          this.logger.log(`No new metadata to import for dsp_id ${idDspsReport}`);
        }
      }
    } catch (err: any) {
      this.logger.error(`Failed to sync metadata after assigning dsp_report: ${err.message}`, err.stack);
    }
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
