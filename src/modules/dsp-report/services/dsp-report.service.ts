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

  const response: DspsReportResponse = {
    idDspsReport: row.id_dsps_report,
    pgUuid: row.pg_uuid || null,
    dspName: row.dsp_name,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    pgDspsSync,
  };

  // Stats từ dsp_report_stats (LEFT JOIN có thể trả null → coerce về 0).
  if (row.total_releases_count !== undefined) {
    response.totalReleasesCount = Number(row.total_releases_count ?? 0);
    response.pendingReleasesCount = Number(row.pending_releases_count ?? 0);
  }

  return response;
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

    // Count query.
    // Note: ClickHouse không cho `LEFT JOIN t FINAL alias ON ...` (parser expect
    // ON/USING/SAMPLE sau FINAL). Dùng subquery `(SELECT * FROM t FINAL) alias`.
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
      name: 'lower(r.dsp_name)',
      dspName: 'lower(r.dsp_name)',
      source: 'lower(r.source)',
      createdAt: 'r.created_at',
      created_at: 'r.created_at',
      updatedAt: 'r.updated_at',
      updated_at: 'r.updated_at',
    };

    const fieldOrder = query.fieldOrder && allowedSortFields[query.fieldOrder]
      ? allowedSortFields[query.fieldOrder]
      : 'lower(r.dsp_name)';

    const orderBy = query.orderBy && ['ASC', 'DESC'].includes(query.orderBy.toUpperCase())
      ? query.orderBy.toUpperCase()
      : 'ASC';

    // Data query with pagination — đọc luôn stats từ dsp_report_stats (đã materialize).
    // Bỏ getImportStatsBatch khỏi hot path: latency giảm từ O(fact_rows) → O(page_size).
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
         p.updated_at AS pg_dsps_sync_updated_at,
         s.total_releases_count AS total_releases_count,
         s.pending_releases_count AS pending_releases_count
       FROM ${CLICKHOUSE_TABLES.DSPS_REPORT} r FINAL
       LEFT JOIN (SELECT * FROM ${CLICKHOUSE_TABLES.PG_DSPS_SYNC} FINAL) p ON r.pg_uuid = p.pg_uuid
       LEFT JOIN (SELECT * FROM ${CLICKHOUSE_TABLES.DSP_REPORT_STATS} FINAL) s ON r.id_dsps_report = s.id_dsps_report
       ${whereClause}
       ORDER BY ${fieldOrder} ${orderBy}
       LIMIT ${pageSize} OFFSET ${offset}`,
      params,
    );

    const items = rows.map(mapRawDspsReport);
    // Stats đã có sẵn trong row (nếu report chưa có entry, mapRawDspsReport để
    // undefined → coerce về 0 ở đây để giữ shape response nhất quán).
    for (const item of items) {
      if (item.totalReleasesCount === undefined) item.totalReleasesCount = 0;
      if (item.pendingReleasesCount === undefined) item.pendingReleasesCount = 0;
    }

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
    const map = await this.getImportStatsBatch([idDspsReport]);
    return map.get(idDspsReport) ?? { totalReleasesCount: 0, pendingReleasesCount: 0 };
  }

  /**
   * Batch version: tính stats cho NHIỀU dsps_report cùng lúc.
   */
  async getImportStatsBatch(
    ids: string[],
  ): Promise<Map<string, { totalReleasesCount: number; pendingReleasesCount: number }>> {
    const result = new Map<string, { totalReleasesCount: number; pendingReleasesCount: number }>();
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    if (uniqueIds.length === 0) return result;
    for (const id of uniqueIds) {
      result.set(id, { totalReleasesCount: 0, pendingReleasesCount: 0 });
    }

    const rows = await this.clickHouseService.query<{
      dsp_id: string;
      total: string | number;
      pending: string | number;
    }>(
      `
        SELECT
          dsp_id,
          count() AS total,
          countIf(any_upc_match = 0 AND any_isrc_match = 0) AS pending
        FROM (
          SELECT
            dsp_id,
            upc_key,
            max(isrc_matched) AS any_isrc_match,
            max(upc_matched)  AS any_upc_match
          FROM (
            SELECT
              dsp_id,
              upc_key,
              if(
                isrc_norm != '' AND isrc_norm IN (
                  SELECT upper(isrc)
                  FROM ${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL
                  WHERE is_deleted = 0 AND isrc != ''
                ), 1, 0
              ) AS isrc_matched,
              if(
                match(upc_key, '^[0-9]+$')
                AND toString(toUInt64OrZero(upc_key)) IN (
                  SELECT DISTINCT
                    if(match(release_upc, '^[0-9]+$'),
                       toString(toUInt64OrZero(release_upc)),
                       release_upc)
                  FROM ${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL
                  WHERE is_deleted = 0 AND release_upc != ''
                ), 1, 0
              ) AS upc_matched
            FROM (
              SELECT
                dsp_id,
                multiIf(
                  upc != '' AND upc != 'N/A', upc,
                  isrc != '' AND isrc != 'N/A', concat('ISRC-', upper(isrc)),
                  ''
                ) AS upc_key,
                if(isrc != '' AND isrc != 'N/A', upper(isrc), '') AS isrc_norm
              FROM (
                SELECT dsp_id, trimBoth(toString(upc)) AS upc, trimBoth(toString(isrc)) AS isrc
                FROM music_analytics.fact_sales_report
                WHERE dsp_id IN ({ids:Array(String)})
                  AND (trimBoth(toString(upc)) != '' OR trimBoth(toString(isrc)) != '')
                UNION ALL
                SELECT dsp_id, trimBoth(toString(upc)) AS upc, trimBoth(toString(isrc)) AS isrc
                FROM music_analytics.fact_dsp_comprehensive_report
                WHERE dsp_id IN ({ids:Array(String)})
                  AND (trimBoth(toString(upc)) != '' OR trimBoth(toString(isrc)) != '')
              )
              WHERE (upc != '' AND upc != 'N/A') OR (isrc != '' AND isrc != 'N/A')
            )
            WHERE upc_key != ''
          )
          GROUP BY dsp_id, upc_key
        )
        GROUP BY dsp_id
      `,
      { ids: uniqueIds },
    );

    for (const row of rows) {
      result.set(row.dsp_id, {
        totalReleasesCount: Number(row.total ?? 0),
        pendingReleasesCount: Number(row.pending ?? 0),
      });
    }

    return result;
  }

  /**
   * Recompute stats cho một tập id_dsps_report và persist vào bảng dsp_report_stats.
   * Dùng ReplacingMergeTree(updated_at) nên insert row mới sẽ đè phiên bản cũ.
   * Ids không có data fact vẫn được ghi row (0, 0) để tránh "missing" ở read path.
   * Gọi từ: syncMetadataAfterAssign, unassign, ETL post-import, cron.
   */
  async refreshStats(ids: string[]): Promise<void> {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    if (uniqueIds.length === 0) return;

    try {
      const statsMap = await this.getImportStatsBatch(uniqueIds);
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      const rows = uniqueIds.map((id) => {
        const s = statsMap.get(id) ?? { totalReleasesCount: 0, pendingReleasesCount: 0 };
        return {
          id_dsps_report: id,
          total_releases_count: s.totalReleasesCount,
          pending_releases_count: s.pendingReleasesCount,
          updated_at: now,
        };
      });

      await this.clickHouseService.insert(CLICKHOUSE_TABLES.DSP_REPORT_STATS, rows);
      this.logger.debug(`refreshStats: persisted ${rows.length} rows into ${CLICKHOUSE_TABLES.DSP_REPORT_STATS}`);
    } catch (err: any) {
      this.logger.error(
        `refreshStats failed for ${uniqueIds.length} ids: ${err.message}`,
        err.stack,
      );
    }
  }

  /**
   * Refresh stats cho toàn bộ dsps_report. Chunk để không tính batch quá lớn 1 lần.
   * Dùng ở cron 15p + startup backfill.
   */
  async refreshAllStats(): Promise<void> {
    const startedAt = Date.now();
    // Small chunk so GC can reclaim between iterations — 500 DSPs × millions of fact rows = OOM.
    const CHUNK_SIZE = 10;

    try {
      const idRows = await this.clickHouseService.query<{ id_dsps_report: string }>(
        `SELECT DISTINCT id_dsps_report FROM ${CLICKHOUSE_TABLES.DSPS_REPORT} FINAL`,
      );
      const allIds = idRows.map((r) => r.id_dsps_report).filter(Boolean);

      if (allIds.length === 0) {
        this.logger.log('refreshAllStats: no dsps_report found, skipped');
        return;
      }

      this.logger.log(`refreshAllStats: refreshing ${allIds.length} dsps_report entries...`);
      for (let i = 0; i < allIds.length; i += CHUNK_SIZE) {
        const chunk = allIds.slice(i, i + CHUNK_SIZE);
        await this.refreshStats(chunk);
      }
      this.logger.log(
        `refreshAllStats: done ${allIds.length} entries in ${Date.now() - startedAt}ms`,
      );
    } catch (err: any) {
      this.logger.error(`refreshAllStats failed: ${err.message}`, err.stack);
    }
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

    // Đẩy phần sync metadata (scan 2 fact table + extractAndImport — nặng) sang
    // background để response trả về ngay. Stats trong getList tính realtime nên
    // FE thấy pendingReleasesCount cập nhật khi import xong.
    void this.syncMetadataAfterAssign(idDspsReport, pgUuid).catch((err: any) =>
      this.logger.error(
        `Background metadata sync failed for dsp_report ${idDspsReport}: ${err.message}`,
        err.stack,
      ),
    );
  }

  /**
   * Scan raw metadata từ ClickHouse và import các release/track/video chưa có vào Postgres.
   * Chạy nền sau khi assign — không chặn response.
   */
  private async syncMetadataAfterAssign(idDspsReport: string, pgUuid: string): Promise<void> {
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

    // Sau khi assign + import xong, recompute stats để list API đọc phiên bản mới.
    // Không dùng void ở đây: syncMetadataAfterAssign đã chạy background từ caller
    // nên await refreshStats không chặn HTTP response.
    await this.refreshStats([idDspsReport]);
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

    // Recompute stats: pgUuid rỗng → không match Release/Track/Video → pending = total.
    // Chạy background để không chặn HTTP response.
    void this.refreshStats([idDspsReport]).catch((err: any) =>
      this.logger.error(
        `Background refreshStats after unassign failed for ${idDspsReport}: ${err.message}`,
        err.stack,
      ),
    );
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
