import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { CLICKHOUSE_TABLES } from 'src/modules/clickhouse/clickhouse.constants';
import { checkIsSystemTenant } from 'src/modules/user/utils/user-type.util';
import { isValidStandardUpc } from 'src/utils/upc.util';
import { zipFolder } from 'src/utils/util';
import { AnalyticsReportExportDto } from '../dto/analytics-report-export.dto';
import {
  AnalyticsReportExportResult,
  SummaryRow,
  RawDetailRow,
  DetailRow,
  MetadataRow,
  ExportProgressPatch,
} from '../interfaces/analytics-report-export.interface';
import {
  getRawDetailsPageQuery,
  getTrackMetadataQuery,
  getTenantNamesQuery,
  getReleaseMetadataByUpcQuery,
  getUniqueIdentifiersQuery,
} from '../queries/analytics-report-export.queries';
import {
  GroupState,
  SummaryAccumulator,
  createEmptyAccumulator,
  formatRevenueSum,
  updateAccumulator,
  createStreamWriter,
} from './stream-detail-writer';

/** Lỗi báo job bị huỷ giữa chừng. */
export class ExportJobCancelledError extends Error {
  constructor(jobId: string) {
    super(`Export job ${jobId} was cancelled`);
    this.name = ExportJobCancelledError.name;
  }
}

/**
 * Dependencies mà ExportRunner cần, dạng interface thuần (không phụ thuộc Nest).
 * - Main thread: implement bằng các injected service (ClickHouseService, pg EntityManager, R2Service).
 * - Worker thread: implement bằng raw client (ClickHouse client, pg Pool, S3 client) dựng từ env.
 */
export interface ExportRunnerDeps {
  chQuery<T = Record<string, unknown>>(
    sql: string,
    params?: Record<string, unknown>,
  ): Promise<T[]>;
  chQueryStream<T = Record<string, unknown>>(
    sql: string,
    params: Record<string, unknown> | undefined,
    onRows: (rows: T[]) => Promise<void> | void,
  ): Promise<number>;
  pgQuery<T = any>(sql: string, params: unknown[]): Promise<T[]>;
  r2Upload(args: {
    key: string;
    filePath: string;
    contentType: string;
    isPublic?: boolean;
  }): Promise<unknown>;
  r2SignedUrlDown(args: {
    key: string;
    fileName: string;
    isPublic?: boolean;
  }): Promise<string>;
  /** Cập nhật fileName thật sau khi resolve tên workspace (optional). */
  updateFileName?(fileName: string): Promise<void>;
  /** Forward progress (main → SSE, hoặc worker → postMessage). */
  onProgress?(patch: ExportProgressPatch, force?: boolean): Promise<void>;
  /** Trả true nếu job đã bị huỷ → runner ném ExportJobCancelledError. */
  isCancelled?(): Promise<boolean>;
}

/**
 * ExportRunner — toàn bộ logic export analytics report, framework-agnostic.
 * Chỉ phụ thuộc các callback trong ExportRunnerDeps nên chạy được ở cả main
 * thread (Nest DI) lẫn worker_threads (raw clients).
 */
export class ExportRunner {
  private readonly sanitizedNamesCache = new Map<string, string>();

  constructor(
    private readonly deps: ExportRunnerDeps,
    private readonly jobId: string,
  ) {}

  private async throwIfCancelled(): Promise<void> {
    if (this.deps.isCancelled && (await this.deps.isCancelled())) {
      throw new ExportJobCancelledError(this.jobId);
    }
  }

  async run(
    tenantId: string,
    dto: AnalyticsReportExportDto,
  ): Promise<AnalyticsReportExportResult> {
    await this.throwIfCancelled();
    const range = this.getMonthRange(dto);
    const trackIsrc = await this.resolveTrackIsrc(dto.trackId);
    if (dto.trackId && !trackIsrc) {
      throw new Error('trackId does not have a valid ISRC');
    }

    const tenantNamesMap = await this.getTenantNames([tenantId]);
    const tenantName = tenantNamesMap.get(tenantId) || 'unnamed_workspace';
    const fileName = this.buildFileName(tenantName, dto);
    if (this.deps.updateFileName) {
      await this.deps.updateFileName(fileName).catch(() => undefined);
    }
    const tempDir = path.join(os.tmpdir(), `export-split-${uuidv4()}`);
    const zipPath = path.join(os.tmpdir(), `${uuidv4()}-${fileName}`);
    const key = `exports/analytics/${tenantId}/${uuidv4()}-${fileName}`;
    const format = dto.format ?? 'csv';
    const groups = new Map<string, GroupState>();
    const cache = {
      trackMeta: new Map<string, MetadataRow>(),
      releaseMeta: new Map<string, MetadataRow>(),
      tenantNames: new Map<string, string>(),
    };

    try {
      await fs.promises.mkdir(tempDir, { recursive: true });

      // Step 1: Pre-fetch metadata vào cache job-local
      await this.deps.onProgress?.({ progressCurrent: 1, progressLabel: 'Pre-fetching metadata' }, true);
      await this.throwIfCancelled();
      await this.prefetchMetadata(tenantId, dto, trackIsrc, cache);

      // Step 2: Stream 1-pass → enrich → ghi trực tiếp vào file group
      await this.deps.onProgress?.({ progressCurrent: 2, progressLabel: 'Streaming data' }, true);
      const stringPool = new Map<string, string>();
      let totalRows = 0;
      let sinceYield = 0;
      let sinceProgress = 0;

      await this.streamRawDetails(tenantId, dto, trackIsrc, async (rawRows) => {
        for (const raw of rawRows) {
          const detail = this.enrichSingleRow(raw, stringPool, cache);
          const groupKeys = this.getRowGroupKeys(detail, dto);

          for (const gk of groupKeys) {
            let group = groups.get(gk);
            if (!group) {
              const groupFolder = path.join(tempDir, gk);
              await fs.promises.mkdir(groupFolder, { recursive: true });
              group = {
                writer: createStreamWriter(
                  path.join(groupFolder, `detail.${format}`),
                  format,
                ),
                summary: createEmptyAccumulator(),
              };
              groups.set(gk, group);
            }
            group.writer.appendRow(detail as any);
            updateAccumulator(group.summary, detail as any);
          }
          totalRows++;
          sinceYield++;
          sinceProgress++;

          if (sinceYield >= 1000) {
            sinceYield = 0;
            await new Promise((resolve) => setImmediate(resolve));
          }
        }

        await this.throwIfCancelled();
        if (sinceProgress >= 50_000) {
          sinceProgress = 0;
          await this.deps.onProgress?.({
            progressCurrent: 2,
            progressLabel: `Streaming data (${totalRows} rows)`,
            processedRows: totalRows,
          }, false);
        }
      });
      stringPool.clear();

      // Step 3: Flush writers, ghi summary
      await this.deps.onProgress?.({ progressCurrent: 3, progressLabel: `Finalizing ${groups.size} folders` }, true);
      for (const [gk, group] of groups) {
        await this.throwIfCancelled();
        await group.writer.flush();
        const summary = this.buildSummaryFromAccumulator(group.summary, gk, dto);
        await this.writeSummaryFile(path.join(tempDir, gk, `summary.${format}`), summary, format);
      }

      // Step 4: ZIP + Upload
      await this.deps.onProgress?.({ progressCurrent: 3, progressLabel: 'Creating ZIP archive' }, true);
      await this.throwIfCancelled();
      await zipFolder(tempDir, zipPath);

      await this.deps.onProgress?.({
        progressCurrent: 4, progressLabel: 'Uploading ZIP file',
        processedRows: totalRows, totalRows,
      }, true);
      await this.throwIfCancelled();

      await this.deps.r2Upload({ key, filePath: zipPath, contentType: 'application/zip', isPublic: false });

      return {
        fileName, key,
        downloadUrl: await this.deps.r2SignedUrlDown({ key, fileName, isPublic: false }),
        expiresInSeconds: 4 * 3600,
        totalRows,
      };
    } finally {
      this.sanitizedNamesCache.clear();
      for (const [, g] of groups) {
        await g.writer.flush().catch(() => {});
      }
      await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
      await fs.promises.unlink(zipPath).catch(() => undefined);
    }
  }

  // PLACEHOLDER_HELPERS

  private getRowGroupKeys(row: DetailRow, dto: AnalyticsReportExportDto): string[] {
    const keys: string[] = [];
    const tenantFolder = this.sanitizeFileName(row.tenant || 'unnamed_workspace');
    const isExportArtist = dto.isExportArtist === true || (dto.isExportArtist as any) === 'true';
    const periodUnit = dto.periodUnit || 'none';
    keys.push(tenantFolder);

    if (periodUnit === 'month' || periodUnit === 'quarter') {
      const periodKey = this.getPeriodKey(row.date, periodUnit);
      keys.push(`${tenantFolder}/${periodKey}`);
      if (isExportArtist) {
        keys.push(`${tenantFolder}/${periodKey}/${this.sanitizeFileName(row.artistName || 'unnamed_artist')}`);
      }
    } else if (isExportArtist) {
      keys.push(`${tenantFolder}/${this.sanitizeFileName(row.artistName || 'unnamed_artist')}`);
    }
    return keys;
  }

  private getPeriodKey(date: string, unit: string): string {
    if (unit === 'quarter' || unit === 'quater') {
      const [year, month] = date.split('-').map(Number);
      return `${year}-Q${Math.ceil(month / 3)}`;
    }
    return date;
  }

  private buildSummaryFromAccumulator(acc: SummaryAccumulator, groupPath: string, dto: AnalyticsReportExportDto): SummaryRow {
    const parts = groupPath.split('/');
    let artistName = '';
    let period = '';
    const periodUnit = dto.periodUnit || 'none';
    const isExportArtist = dto.isExportArtist === true || (dto.isExportArtist as any) === 'true';

    if (parts.length === 2) {
      if (periodUnit === 'month' || periodUnit === 'quarter') period = parts[1];
      else if (isExportArtist) artistName = parts[1];
    } else if (parts.length === 3) {
      period = parts[1];
      artistName = parts[2];
    }

    return {
      startDate: acc.minStartDate || `${dto.fromDate}-01`,
      endDate: acc.maxEndDate || this.lastDayOfMonth(dto.endDate),
      tenantName: acc.tenantName || 'unnamed_workspace',
      artistName: artistName || undefined,
      period: period || undefined,
      totalUsage: acc.totalUsage,
      revenueUsd: formatRevenueSum(acc),
      currency: 'USD',
      trackCount: acc.uniqueIsrcs.size,
      releaseCount: acc.uniqueReleases.size,
      labelCount: acc.uniqueLabels.size,
      dspCount: acc.uniqueDsps.size,
      territoryCount: acc.uniqueTerritories.size,
      artistCount: acc.uniqueArtists.size,
    } as any;
  }

  private getSummaryColumns(): Partial<ExcelJS.Column>[] {
    return [
      { header: 'StartDate', key: 'startDate', width: 14 },
      { header: 'EndDate', key: 'endDate', width: 14 },
      { header: 'WorkspaceName', key: 'tenantName', width: 28 },
      { header: 'TotalUsage', key: 'totalUsage', width: 14 },
      { header: 'RevenueUsd', key: 'revenueUsd', width: 18 },
      { header: 'Currency', key: 'currency', width: 10 },
      { header: 'TrackCount', key: 'trackCount', width: 12 },
      { header: 'ReleaseCount', key: 'releaseCount', width: 14 },
      { header: 'LabelCount', key: 'labelCount', width: 12 },
      { header: 'DspCount', key: 'dspCount', width: 12 },
      { header: 'TerritoryCount', key: 'territoryCount', width: 15 },
      { header: 'ArtistCount', key: 'artistCount', width: 12 },
    ];
  }

  private async writeSummaryFile(
    filePath: string,
    summary: SummaryRow,
    format: 'xlsx' | 'csv',
  ): Promise<void> {
    if (format === 'csv') {
      const columns = this.getSummaryColumns();
      const headers = columns.map((c) => c.header?.toString() ?? '');
      const keys = columns.map((c) => c.key?.toString() ?? '');
      const lines = [
        `﻿${headers.map((h) => this.csvEscape(h)).join(',')}`,
        keys.map((key) => this.csvEscape((summary as any)[key])).join(','),
      ];
      await fs.promises.writeFile(filePath, lines.join('\n'), 'utf8');
    } else {
      const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
        filename: filePath,
        useStyles: true,
        useSharedStrings: false,
      });
      const sheet = workbook.addWorksheet('Summary');
      sheet.columns = this.getSummaryColumns();
      sheet.addRow(summary).commit();
      sheet.commit();
      await workbook.commit();
    }
  }

  // PLACEHOLDER_METADATA

  private async prefetchMetadata(
    tenantId: string,
    dto: AnalyticsReportExportDto,
    trackIsrc: string | null,
    cache: {
      trackMeta: Map<string, MetadataRow>;
      releaseMeta: Map<string, MetadataRow>;
      tenantNames: Map<string, string>;
    },
  ): Promise<void> {
    const filters = this.buildFilters(tenantId, dto, trackIsrc);
    const uniqueIdentifiersSql = getUniqueIdentifiersQuery(
      this.getCommonJoins(),
      filters.whereSql,
    );

    const rows = await this.deps.chQuery<any>(uniqueIdentifiersSql, filters.params);

    const uniqueIsrcs = new Set<string>();
    const uniqueTenantIds = new Set<string>();
    for (const row of rows) {
      if (row.isrc) uniqueIsrcs.add(row.isrc);
      if (row.tenant_id) uniqueTenantIds.add(row.tenant_id);
    }

    const isrcs = Array.from(uniqueIsrcs);
    const tenantIds = Array.from(uniqueTenantIds);

    const BATCH = 5000;
    for (let i = 0; i < isrcs.length; i += BATCH) {
      const batchIsrcs = isrcs.slice(i, i + BATCH);
      const trackMap = await this.getTrackMetadata(batchIsrcs);

      const upcsToFetch = new Set<string>();
      for (const [isrc, track] of trackMap) {
        cache.trackMeta.set(isrc, track);
        if (track.release_upc) upcsToFetch.add(track.release_upc);
      }

      if (upcsToFetch.size > 0) {
        const releaseMap = await this.getReleaseMetadataByUpc(Array.from(upcsToFetch));
        for (const [upc, release] of releaseMap) {
          cache.releaseMeta.set(upc, release);
        }
      }
    }

    if (tenantIds.length > 0) {
      const tenantMap = await this.getTenantNames(tenantIds);
      for (const [tid, tname] of tenantMap) {
        cache.tenantNames.set(tid, tname);
      }
    }
  }

  private enrichSingleRow(
    raw: RawDetailRow,
    stringPool: Map<string, string>,
    cache: {
      trackMeta: Map<string, MetadataRow>;
      releaseMeta: Map<string, MetadataRow>;
      tenantNames: Map<string, string>;
    },
  ): DetailRow {
    const pool = (val: string | null | undefined): string | undefined => {
      if (!val) return undefined;
      let cached = stringPool.get(val);
      if (!cached) {
        cached = val;
        stringPool.set(val, cached);
      }
      return cached;
    };

    const isrc = raw.isrc;
    const trackInfo = isrc ? cache.trackMeta.get(isrc) : null;
    const isStandardUpc = isValidStandardUpc(raw.fallback_upc || '');
    const upcToLookup = isStandardUpc ? raw.fallback_upc : trackInfo?.release_upc;
    const releaseInfo = upcToLookup ? cache.releaseMeta.get(upcToLookup) : null;

    const baseInfo = trackInfo || releaseInfo;
    const finalTenantName = raw.tenant_id
      ? cache.tenantNames.get(raw.tenant_id)
      : baseInfo?.workspace_name;

    const artistNameRaw = pool(raw.fallback_artist_name || trackInfo?.artist_names || releaseInfo?.artist_names || '');

    return {
      date: pool(raw.date),
      startDate: pool(raw.start_date),
      endDate: pool(raw.end_date),
      tenant: pool(finalTenantName),
      dspName: pool(raw.dsp_name),
      upc: pool(raw.fallback_upc),
      isrc: pool(raw.isrc),
      releaseName: pool(raw.fallback_album_title || baseInfo?.release_title || ''),
      trackName: pool(raw.fallback_track_title || trackInfo?.track_title || ''),
      artistName: artistNameRaw,
      labelName: pool(raw.fallback_label_name || baseInfo?.label_name || ''),
      territory: pool(raw.territory),
      totalUsage: Number(raw.total_usage || 0),
      revenueUsd: String(raw.revenue_usd || '0.00'),
      currency: pool('USD'),
    } as any;
  }

  private sanitizeFileName(name: string): string {
    let cached = this.sanitizedNamesCache.get(name);
    if (cached !== undefined) return cached;

    const sanitized = name
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .substring(0, 100) || 'unnamed';

    this.sanitizedNamesCache.set(name, sanitized);
    return sanitized;
  }

  // PLACEHOLDER_QUERY

  private buildFileName(tenantName: string, dto: AnalyticsReportExportDto): string {
    const sanitized = this.sanitizeFileName(tenantName);
    const pad = (n: number) => String(n).padStart(2, '0');
    const now = new Date();
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    return `${sanitized}_analytics-report_${dto.fromDate}_${dto.endDate}_${timestamp}.zip`;
  }

  private getMonthRange(dto: AnalyticsReportExportDto) {
    if (dto.fromDate > dto.endDate) {
      throw new Error('fromDate must be before or equal to endDate');
    }
    return {
      from: `${dto.fromDate}-01`,
      to: `${dto.endDate}-01`,
      startDate: `${dto.fromDate}-01`,
      endDate: this.lastDayOfMonth(dto.endDate),
    };
  }

  private async resolveTrackIsrc(trackId?: string): Promise<string | null> {
    if (!trackId) return null;
    const rows = await this.deps.pgQuery(
      `SELECT isrc FROM tracks WHERE id = $1 LIMIT 1`,
      [trackId],
    );
    return rows[0]?.isrc || null;
  }

  private buildFilters(
    tenantId: string,
    dto: AnalyticsReportExportDto,
    trackIsrc: string | null,
  ) {
    const params: Record<string, unknown> = {
      from: `${dto.fromDate}-01`,
      to: `${dto.endDate}-01`,
    };
    const filters: string[] = [
      's.period >= toDate({from:String})',
      's.period <= toDate({to:String})',
    ];

    const resolvedTenantIds = dto.tenantIds?.length
      ? dto.tenantIds
      : (!checkIsSystemTenant(tenantId) ? [tenantId] : []);

    if (resolvedTenantIds.length > 0) {
      filters.push('t.is_deleted = 0');
      filters.push('t.tenant_id IN ({tenantIds:Array(String)})');
      params.tenantIds = resolvedTenantIds;
    }

    if (dto.labelId) {
      filters.push('t.is_deleted = 0');
      filters.push('t.label_id = {labelId:String}');
      params.labelId = dto.labelId;
    }

    if (dto.releaseId) {
      filters.push('t.is_deleted = 0');
      filters.push('t.release_id = {releaseId:String}');
      params.releaseId = dto.releaseId;
    }

    if (dto.artistId) {
      filters.push('t.is_deleted = 0');
      filters.push('has(t.artist_ids, {artistId:String})');
      params.artistId = dto.artistId;
    }

    if (dto.releaseType) {
      filters.push('t.is_deleted = 0');
      filters.push('t.release_type = {releaseType:String}');
      params.releaseType = dto.releaseType;
    }

    if (trackIsrc) {
      filters.push('s.isrc = {trackIsrc:String}');
      params.trackIsrc = trackIsrc;
    }

    if (dto.dspId) {
      filters.push(`(
        s.dsp_id = {dspId:String}
        OR r.pg_uuid = {dspId:String}
        OR p.pg_uuid = {dspId:String}
        OR p.dsp_code = {dspId:String}
      )`);
      params.dspId = dto.dspId;
    }

    return {
      params,
      whereSql: filters.length ? `WHERE ${filters.join(' AND ')}` : '',
    };
  }

  private getCommonJoins() {
    return `
      LEFT JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL) t ON s.isrc = t.isrc
      LEFT JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.DSPS_REPORT} FINAL) r ON s.dsp_id = r.id_dsps_report
      LEFT JOIN (SELECT * FROM music_analytics.${CLICKHOUSE_TABLES.PG_DSPS_SYNC} FINAL) p ON r.pg_uuid = p.pg_uuid
    `;
  }

  private async streamRawDetails(
    tenantId: string,
    dto: AnalyticsReportExportDto,
    trackIsrc: string | null,
    onRows: (rows: RawDetailRow[]) => Promise<void>,
  ): Promise<number> {
    const { params, whereSql } = this.buildFilters(tenantId, dto, trackIsrc);
    const resolvedDspName =
      "coalesce(nullIf(p.dsp_name, ''), nullIf(r.dsp_name, ''), s.dsp_id)";

    const query = getRawDetailsPageQuery(
      resolvedDspName,
      this.getCommonJoins(),
      whereSql,
    );

    return this.deps.chQueryStream<RawDetailRow>(query, params, onRows);
  }

  private async getTrackMetadata(isrcs: string[]): Promise<Map<string, MetadataRow>> {
    const map = new Map<string, MetadataRow>();
    if (!isrcs.length) return map;
    const rows = await this.deps.pgQuery(getTrackMetadataQuery(), [isrcs]);
    for (const row of rows) map.set(row.isrc, row);
    return map;
  }

  private async getTenantNames(tenantIds: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (!tenantIds.length) return map;

    const validUuidTenantIds = tenantIds.filter((id) => {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      if (!isUuid && id === 'system-tenant') {
        map.set(id, 'System Tenant');
      }
      return isUuid;
    });

    if (!validUuidTenantIds.length) return map;

    const rows = await this.deps.pgQuery(getTenantNamesQuery(), [validUuidTenantIds]);
    for (const row of rows) map.set(row.id, row.tenant_name);
    return map;
  }

  private async getReleaseMetadataByUpc(upcs: string[]): Promise<Map<string, MetadataRow>> {
    const map = new Map<string, MetadataRow>();
    if (!upcs.length) return map;
    const rows = await this.deps.pgQuery(getReleaseMetadataByUpcQuery(), [upcs]);
    for (const row of rows) map.set(row.upc, row);
    return map;
  }

  private csvEscape(value: unknown): string {
    const text = value == null ? '' : String(value);
    if (/[",\n\r]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  private lastDayOfMonth(month: string): string {
    const [year, monthNumber] = month.split('-').map((part) => Number(part));
    const lastDay = new Date(year, monthNumber, 0).getDate();
    return `${month}-${String(lastDay).padStart(2, '0')}`;
  }
}
