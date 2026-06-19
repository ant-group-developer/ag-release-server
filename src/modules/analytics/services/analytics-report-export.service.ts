import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectEntityManager } from '@nestjs/typeorm';
import * as ExcelJS from 'exceljs';
import { once } from 'events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CLICKHOUSE_TABLES } from 'src/modules/clickhouse/clickhouse.constants';
import { ClickHouseService } from 'src/modules/clickhouse/clickhouse.service';
import { BucketR2Service } from 'src/modules/bucket2/services/bucket-r2.service';
import {
  ImportJob,
  ImportJobSourceType,
  ImportJobStatus,
} from 'src/modules/etl/interfaces';
import { ImportJobsService } from 'src/modules/etl/services/import-jobs/import-jobs.service';
import { checkIsSystemTenant } from 'src/modules/user/utils/user-type.util';
import { isValidStandardUpc } from 'src/utils/upc.util';
import { EntityManager } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { AnalyticsReportExportDto } from '../dto/analytics-report-export.dto';

export interface AnalyticsReportExportResult {
  fileName: string;
  key: string;
  downloadUrl: string;
  expiresInSeconds: number;
  totalRows: number;
}

export interface AnalyticsReportExportJobResult {
  jobId: string;
  status: ImportJobStatus;
  eventsUrl: string;
}

export interface AnalyticsReportExportCancelResult {
  jobId: string;
  status: ImportJobStatus;
  cancelled: boolean;
}

export interface AnalyticsReportExportCancelAllResult {
  cancelledCount: number;
  jobIds: string[];
  skippedCount: number;
}

export interface AnalyticsReportExportCancelListResult
  extends AnalyticsReportExportCancelAllResult {}

interface SummaryRow {
  startDate: string;
  endDate: string;
  totalUsage: number;
  revenueUsd: string;
  currency: string;
  trackCount: number;
  releaseCount: number;
  labelCount: number;
  dspCount: number;
  territoryCount: number;
}

interface RawDetailRow {
  date: string;
  start_date: string;
  end_date: string;
  dsp_id: string;
  dsp_name: string;
  territory: string;
  isrc: string;
  tenant_id: string;
  release_id: string;
  label_id: string;
  fallback_upc: string;
  fallback_track_title: string;
  fallback_album_title: string;
  fallback_artist_name: string;
  fallback_label_name: string;
  total_usage: string;
  revenue_usd: string;
}

interface DetailRow {
  date: string;
  startDate: string;
  endDate: string;
  tenant: string;
  dspName: string;
  upc: string;
  isrc: string;
  releaseName: string;
  trackName: string;
  artistName: string;
  labelName: string;
  territory: string;
  totalUsage: number;
  revenueUsd: string;
  currency: string;
}

interface MetadataRow {
  isrc?: string;
  upc?: string;
  workspace_name: string;
  release_title: string;
  release_upc: string;
  catalog_id: string;
  release_date: string | null;
  track_title?: string;
  label_name: string;
  artist_names: string;
}

type ExportProgressPatch = {
  progressCurrent?: number;
  progressTotal?: number;
  progressLabel?: string;
  processedRows?: number;
  totalRows?: number;
};

class ExportJobCancelledError extends Error {
  constructor(jobId: string) {
    super(`Export job ${jobId} was cancelled`);
    this.name = ExportJobCancelledError.name;
  }
}

@Injectable()
export class AnalyticsReportExportService {
  private readonly logger = new Logger(AnalyticsReportExportService.name);
  private readonly batchSize = 10_000;
  private readonly exportRetentionDays = 7;
  private readonly cleanupBatchSize = 100;
  private readonly cancelledExportJobs = new Set<string>();

  constructor(
    private readonly clickHouseService: ClickHouseService,
    private readonly r2Service: BucketR2Service,
    private readonly importJobsService: ImportJobsService,
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
  ) {}

  async createExportJob(
    tenantId: string,
    userId: string,
    dto: AnalyticsReportExportDto,
  ): Promise<AnalyticsReportExportJobResult> {
    const job = await this.importJobsService.create({
      sourceType: ImportJobSourceType.ANALYTICS_REPORT_EXPORT,
      params: dto as unknown as Record<string, unknown>,
      fileName: this.buildFileName(dto),
      progressTotal: 4,
      tenantId,
      createdBy: userId,
    });

    await this.importJobsService.markQueued(job.id);

    setImmediate(() => {
      void this.runExportJob(job.id, tenantId, dto);
    });

    return {
      jobId: job.id,
      status: ImportJobStatus.QUEUED,
      eventsUrl: `/analytics/reports/export/${job.id}/events`,
    };
  }

  async cancelExportJob(
    jobId: string,
    tenantId: string,
  ): Promise<AnalyticsReportExportCancelResult> {
    const job = await this.getReadableExportJob(jobId, tenantId);
    if (this.isTerminalStatus(job.status)) {
      return {
        jobId: job.id,
        status: job.status,
        cancelled: job.status === ImportJobStatus.CANCELLED,
      };
    }

    this.cancelledExportJobs.add(job.id);
    const cancelledJob = await this.importJobsService.markCancelled(
      job.id,
      'Cancelled by user',
    );
    if (cancelledJob.status !== ImportJobStatus.CANCELLED) {
      this.cancelledExportJobs.delete(job.id);
    }
    return {
      jobId: cancelledJob.id,
      status: cancelledJob.status,
      cancelled: cancelledJob.status === ImportJobStatus.CANCELLED,
    };
  }

  async cancelAllExportJobs(
    tenantId: string,
  ): Promise<AnalyticsReportExportCancelAllResult> {
    const isSystem = checkIsSystemTenant(tenantId);
    const jobs = await this.importJobsService.findActiveJobsBySource(
      ImportJobSourceType.ANALYTICS_REPORT_EXPORT,
      isSystem ? undefined : tenantId,
    );

    const jobIds: string[] = [];
    let skippedCount = 0;
    for (const job of jobs) {
      if (
        job.status !== ImportJobStatus.QUEUED &&
        job.status !== ImportJobStatus.PROCESSING
      ) {
        skippedCount++;
        continue;
      }

      this.cancelledExportJobs.add(job.id);
      const cancelledJob = await this.importJobsService.markCancelled(
        job.id,
        'Cancelled by user',
      );
      if (cancelledJob.status === ImportJobStatus.CANCELLED) {
        jobIds.push(job.id);
      } else {
        this.cancelledExportJobs.delete(job.id);
        skippedCount++;
      }
    }

    return {
      cancelledCount: jobIds.length,
      jobIds,
      skippedCount,
    };
  }

  async cancelExportJobs(
    jobIds: string[],
    tenantId: string,
  ): Promise<AnalyticsReportExportCancelListResult> {
    const uniqueJobIds = Array.from(new Set(jobIds));
    const cancelledJobIds: string[] = [];
    let skippedCount = jobIds.length - uniqueJobIds.length;

    for (const jobId of uniqueJobIds) {
      try {
        const job = await this.getReadableExportJob(jobId, tenantId);
        if (
          job.status !== ImportJobStatus.QUEUED &&
          job.status !== ImportJobStatus.PROCESSING
        ) {
          skippedCount++;
          continue;
        }

        this.cancelledExportJobs.add(job.id);
        const cancelledJob = await this.importJobsService.markCancelled(
          job.id,
          'Cancelled by user',
        );
        if (cancelledJob.status === ImportJobStatus.CANCELLED) {
          cancelledJobIds.push(job.id);
        } else {
          this.cancelledExportJobs.delete(job.id);
          skippedCount++;
        }
      } catch (err) {
        if (err instanceof NotFoundException) {
          skippedCount++;
          continue;
        }
        throw err;
      }
    }

    return {
      cancelledCount: cancelledJobIds.length,
      jobIds: cancelledJobIds,
      skippedCount,
    };
  }

  @Cron('0 3 * * *')
  async cleanupExpiredExportFiles(): Promise<void> {
    const jobs = await this.findExpiredCompletedExportJobs();
    if (!jobs.length) return;

    let deletedCount = 0;
    let skippedCount = 0;
    for (const job of jobs) {
      const key = typeof job.result?.key === 'string' ? job.result.key : '';
      if (!key) {
        skippedCount++;
        continue;
      }

      try {
        await this.r2Service.deletePrivate(key);
      } catch (err) {
        if (!this.isR2NotFoundError(err)) {
          this.logger.warn(
            `Failed to delete expired analytics export file for job ${job.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
          skippedCount++;
          continue;
        }
      }

      await this.importJobsService.patchResult(job.id, {
        downloadUrl: null,
        bucketDeletedAt: new Date().toISOString(),
        bucketDeletedReason: `Expired after ${this.exportRetentionDays} days`,
      });
      deletedCount++;
    }

    if (deletedCount > 0 || skippedCount > 0) {
      this.logger.log(
        `Expired analytics export cleanup finished: deleted=${deletedCount}, skipped=${skippedCount}`,
      );
    }
  }

  private async findExpiredCompletedExportJobs(): Promise<ImportJob[]> {
    const sql = `
      SELECT id FROM ${CLICKHOUSE_TABLES.IMPORT_JOBS} FINAL
      WHERE source_type = {sourceType:String}
        AND status = {status:String}
        AND result != ''
        AND JSONExtractString(result, 'key') != ''
        AND JSONExtractString(result, 'bucketDeletedAt') = ''
        AND coalesce(finished_at, created_at) < now64(3) - toIntervalDay({retentionDays:UInt16})
      ORDER BY finished_at ASC
      LIMIT {limit:UInt32}
    `;
    const rows = await this.clickHouseService.query<{ id: string }>(sql, {
      sourceType: ImportJobSourceType.ANALYTICS_REPORT_EXPORT,
      status: ImportJobStatus.COMPLETED,
      retentionDays: this.exportRetentionDays,
      limit: this.cleanupBatchSize,
    });
    const jobs: ImportJob[] = [];
    for (const row of rows) {
      const job = await this.importJobsService.findById(row.id);
      if (job) jobs.push(job);
    }
    return jobs;
  }

  private isR2NotFoundError(error: unknown): boolean {
    const err = error as { message?: string; statusCode?: number; $metadata?: { httpStatusCode?: number } };
    const statusCode = err.statusCode ?? err.$metadata?.httpStatusCode;
    const message = err.message?.toLowerCase() ?? '';
    return statusCode === 404 || message.includes('not found');
  }

  async exportReport(
    tenantId: string,
    dto: AnalyticsReportExportDto,
    onProgress?: (patch: ExportProgressPatch, force?: boolean) => Promise<void>,
    jobId?: string,
  ): Promise<AnalyticsReportExportResult> {
    await this.throwIfExportJobCancelled(jobId);
    const range = this.getMonthRange(dto);
    const trackIsrc = await this.resolveTrackIsrc(dto.trackId);
    if (dto.trackId && !trackIsrc) {
      throw new BadRequestException('trackId does not have a valid ISRC');
    }
    await this.throwIfExportJobCancelled(jobId);

    const format = dto.format ?? 'xlsx';
    const fileName = this.buildFileName(dto);
    const contentType =
      format === 'csv'
        ? 'text/csv; charset=utf-8'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const tempPath = path.join(os.tmpdir(), `${uuidv4()}-${fileName}`);
    const key = `exports/analytics/${tenantId}/${uuidv4()}-${fileName}`;

    try {
      await onProgress?.(
        { progressCurrent: 1, progressLabel: 'Preparing report' },
        true,
      );
      const summary = await this.getSummary(tenantId, dto, range, trackIsrc);
      await this.throwIfExportJobCancelled(jobId);
      await onProgress?.(
        { progressCurrent: 2, progressLabel: 'Writing report file' },
        true,
      );
      await this.throwIfExportJobCancelled(jobId);

      let totalRows = 0;
      if (format === 'csv') {
        totalRows = await this.writeCsvFile(
          tempPath,
          tenantId,
          dto,
          range,
          trackIsrc,
          onProgress,
          jobId,
        );
      } else {
        totalRows = await this.writeWorkbookFile(
          tempPath,
          summary,
          tenantId,
          dto,
          range,
          trackIsrc,
          onProgress,
          jobId,
        );
      }
      await this.throwIfExportJobCancelled(jobId);

      await onProgress?.(
        {
          progressCurrent: 3,
          progressLabel: 'Uploading report file',
          processedRows: totalRows,
          totalRows,
        },
        true,
      );
      await this.throwIfExportJobCancelled(jobId);

      await this.r2Service.uploadFileFromPath({
        key,
        filePath: tempPath,
        contentType,
        isPublic: false,
      });
      await this.throwIfExportJobCancelled(jobId);

      return {
        fileName,
        key,
        downloadUrl: await this.r2Service.getSignedUrlDown({
          key,
          fileName,
          isPublic: false,
        }),
        expiresInSeconds: 4 * 3600,
        totalRows,
      };
    } finally {
      await fs.promises.unlink(tempPath).catch(() => undefined);
    }
  }

  private async runExportJob(
    jobId: string,
    tenantId: string,
    dto: AnalyticsReportExportDto,
  ): Promise<void> {
    try {
      await this.throwIfExportJobCancelled(jobId);
      await this.importJobsService.markProcessing(jobId);
      await this.throwIfExportJobCancelled(jobId);
      const result = await this.exportReport(
        tenantId,
        dto,
        (patch, force = false) =>
          this.importJobsService.updateProgress(jobId, patch, force),
        jobId,
      );
      await this.throwIfExportJobCancelled(jobId);
      await this.importJobsService.markCompleted(jobId, {
        ...result,
        totalProcessedRows: result.totalRows,
      });
    } catch (err) {
      if (err instanceof ExportJobCancelledError) {
        await this.importJobsService.markCancelled(jobId, 'Cancelled by user');
        return;
      }
      await this.importJobsService.markFailed(
        jobId,
        err instanceof Error ? err : String(err),
      );
    } finally {
      this.cancelledExportJobs.delete(jobId);
    }
  }

  private async getReadableExportJob(jobId: string, tenantId: string) {
    const job =
      this.importJobsService.getSnapshot(jobId) ??
      (await this.importJobsService.findById(jobId));
    if (!job || job.sourceType !== ImportJobSourceType.ANALYTICS_REPORT_EXPORT) {
      throw new NotFoundException(`Export job not found: ${jobId}`);
    }
    if (!checkIsSystemTenant(tenantId) && job.tenantId !== tenantId) {
      throw new NotFoundException(`Export job not found: ${jobId}`);
    }
    return job;
  }

  private isTerminalStatus(status: ImportJobStatus): boolean {
    return (
      status === ImportJobStatus.COMPLETED ||
      status === ImportJobStatus.FAILED ||
      status === ImportJobStatus.CANCELLED
    );
  }

  private async throwIfExportJobCancelled(jobId?: string): Promise<void> {
    if (!jobId) return;
    if (this.cancelledExportJobs.has(jobId)) {
      throw new ExportJobCancelledError(jobId);
    }

    const snapshot = this.importJobsService.getSnapshot(jobId);
    if (snapshot?.status === ImportJobStatus.CANCELLED) {
      this.cancelledExportJobs.add(jobId);
      throw new ExportJobCancelledError(jobId);
    }

    const job = await this.importJobsService.findById(jobId);
    if (job?.status === ImportJobStatus.CANCELLED) {
      this.cancelledExportJobs.add(jobId);
      throw new ExportJobCancelledError(jobId);
    }
  }

  private buildFileName(dto: AnalyticsReportExportDto): string {
    const format = dto.format ?? 'xlsx';
    return `analytics-report_${dto.fromDate}_${dto.endDate}.${format}`;
  }

  private getMonthRange(dto: AnalyticsReportExportDto) {
    if (dto.fromDate > dto.endDate) {
      throw new BadRequestException('fromDate must be before or equal to endDate');
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
    const rows = await this.entityManager.query(
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

    if (!checkIsSystemTenant(tenantId)) {
      filters.push('t.is_deleted = 0');
      filters.push('t.tenant_id = {tenantId:String}');
      params.tenantId = tenantId;
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

  private async getSummary(
    tenantId: string,
    dto: AnalyticsReportExportDto,
    range: { startDate: string; endDate: string },
    trackIsrc: string | null,
  ): Promise<SummaryRow> {
    const { params, whereSql } = this.buildFilters(tenantId, dto, trackIsrc);
    const rows = await this.clickHouseService.query<{
      total_usage: string;
      revenue_usd: string;
      track_count: string;
      release_count: string;
      label_count: string;
      dsp_count: string;
      territory_count: string;
    }>(
      `
        SELECT
          sum(s.total_usage) AS total_usage,
          sum(s.revenue_usd) AS revenue_usd,
          uniq(s.isrc) AS track_count,
          uniqIf(t.release_id, t.release_id != '') AS release_count,
          uniqIf(t.label_id, t.label_id != '') AS label_count,
          uniq(s.dsp_id) AS dsp_count,
          uniq(s.territory_code) AS territory_count
        FROM ${CLICKHOUSE_TABLES.SALES_EXPORT_MONTHLY} s
        ${this.getCommonJoins()}
        ${whereSql}
      `,
      params,
    );
    const row = rows[0];

    return {
      startDate: range.startDate,
      endDate: range.endDate,
      totalUsage: Number(row?.total_usage ?? 0),
      revenueUsd: row?.revenue_usd?.toString() ?? '0',
      currency: 'USD',
      trackCount: Number(row?.track_count ?? 0),
      releaseCount: Number(row?.release_count ?? 0),
      labelCount: Number(row?.label_count ?? 0),
      dspCount: Number(row?.dsp_count ?? 0),
      territoryCount: Number(row?.territory_count ?? 0),
    };
  }

  private async getRawDetails(
    tenantId: string,
    dto: AnalyticsReportExportDto,
    _range: { startDate: string; endDate: string },
    trackIsrc: string | null,
  ): Promise<RawDetailRow[]> {
    return this.getRawDetailsPage(tenantId, dto, _range, trackIsrc, 0, 0);
  }

  private async getRawDetailsPage(
    tenantId: string,
    dto: AnalyticsReportExportDto,
    _range: { startDate: string; endDate: string },
    trackIsrc: string | null,
    limit: number,
    offset: number,
  ): Promise<RawDetailRow[]> {
    const { params, whereSql } = this.buildFilters(tenantId, dto, trackIsrc);
    const resolvedDspName =
      "coalesce(nullIf(p.dsp_name, ''), nullIf(r.dsp_name, ''), s.dsp_id)";
    const pagingSql = limit > 0 ? `LIMIT ${limit} OFFSET ${offset}` : '';

    return this.clickHouseService.query<RawDetailRow>(
      `
        SELECT
          formatDateTime(s.period, '%Y-%m') AS date,
          formatDateTime(s.period, '%Y-%m-01') AS start_date,
          formatDateTime(addDays(addMonths(toStartOfMonth(s.period), 1), -1), '%Y-%m-%d') AS end_date,
          s.dsp_id AS dsp_id,
          ${resolvedDspName} AS dsp_name,
          s.territory_code AS territory,
          s.isrc AS isrc,
          any(t.tenant_id) AS tenant_id,
          any(t.release_id) AS release_id,
          any(t.label_id) AS label_id,
          any(s.upc) AS fallback_upc,
          any(s.track_title) AS fallback_track_title,
          any(s.album_title) AS fallback_album_title,
          any(s.artist_name) AS fallback_artist_name,
          any(s.label_name) AS fallback_label_name,
          sum(s.total_usage) AS total_usage,
          sum(s.revenue_usd) AS revenue_usd
        FROM ${CLICKHOUSE_TABLES.SALES_EXPORT_MONTHLY} s
        ${this.getCommonJoins()}
        ${whereSql}
        GROUP BY date, start_date, end_date, s.dsp_id, dsp_name, territory, isrc
        ORDER BY date ASC, dsp_name ASC, territory ASC, isrc ASC
        ${pagingSql}
      `,
      params,
    );
  }

  private async enrichDetails(rows: RawDetailRow[]): Promise<DetailRow[]> {
    if (!rows.length) return [];

    const isrcs = Array.from(
      new Set(rows.map((r) => r.isrc).filter((isrc) => !isrc.startsWith('UPC-'))),
    );
    const albumUpcs = Array.from(
      new Set(
        rows
          .filter((r) => r.isrc.startsWith('UPC-'))
          .map((r) => r.isrc.substring(4))
          .filter(Boolean),
      ),
    );

    const [trackMeta, releaseMeta] = await Promise.all([
      this.getTrackMetadata(isrcs),
      this.getReleaseMetadataByUpc(albumUpcs),
    ]);
    const tenantNames = await this.getTenantNames(
      Array.from(new Set(rows.map((r) => r.tenant_id).filter(Boolean))),
    );

    return rows.map((row) => {
      const meta = row.isrc.startsWith('UPC-')
        ? releaseMeta.get(row.isrc.substring(4))
        : trackMeta.get(row.isrc);
      const upc = meta?.release_upc || row.fallback_upc || '';

      return {
        date: row.date,
        startDate: row.start_date,
        endDate: row.end_date,
        tenant:
          meta?.workspace_name ||
          tenantNames.get(row.tenant_id) ||
          row.tenant_id ||
          '',
        dspName: row.dsp_name || row.dsp_id,
        upc: isValidStandardUpc(upc) ? upc : '',
        isrc: this.isGeneratedUpcBackfill(row.isrc) ? '' : row.isrc,
        releaseName: meta?.release_title || row.fallback_album_title || '',
        trackName: meta?.track_title || row.fallback_track_title || '',
        artistName: meta?.artist_names || row.fallback_artist_name || '',
        labelName: meta?.label_name || row.fallback_label_name || '',
        territory: row.territory,
        totalUsage: Number(row.total_usage ?? 0),
        revenueUsd: row.revenue_usd?.toString() ?? '0',
        currency: 'USD',
      };
    });
  }

  private isGeneratedUpcBackfill(value: string): boolean {
    return value.trim().toUpperCase().startsWith('UPC-');
  }

  private async getTrackMetadata(isrcs: string[]): Promise<Map<string, MetadataRow>> {
    const map = new Map<string, MetadataRow>();
    if (!isrcs.length) return map;

    const rows = await this.entityManager.query(
      `
        SELECT
          t.isrc AS isrc,
          COALESCE(NULLIF(ten.title, ''), ten.name, '') AS workspace_name,
          r.title AS release_title,
          COALESCE(r.upc, '') AS release_upc,
          COALESCE(r.catalog_id, '') AS catalog_id,
          r.release_date AS release_date,
          t.title AS track_title,
          COALESCE(l.name, '') AS label_name,
          COALESCE(string_agg(DISTINCT a.name, ', '), '') AS artist_names
        FROM tracks t
        INNER JOIN releases r ON r.id = t.release_id
        LEFT JOIN labels l ON l.id = r.label_id
        LEFT JOIN tenants ten ON ten.id = r.tenant_id
        LEFT JOIN track_artist ta ON ta.track_id = t.id
        LEFT JOIN artists a ON a.id = ta.artist_id
        WHERE t.isrc = ANY($1)
        GROUP BY t.isrc, ten.title, ten.name, r.title, r.upc, r.catalog_id, r.release_date, t.title, l.name
      `,
      [isrcs],
    );

    for (const row of rows) {
      map.set(row.isrc, row);
    }
    return map;
  }

  private async getTenantNames(tenantIds: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (!tenantIds.length) return map;

    const rows = await this.entityManager.query(
      `
        SELECT
          id::text AS id,
          COALESCE(NULLIF(title, ''), name, id::text) AS tenant_name
        FROM tenants
        WHERE id = ANY($1)
      `,
      [tenantIds],
    );

    for (const row of rows) {
      map.set(row.id, row.tenant_name);
    }
    return map;
  }

  private async getReleaseMetadataByUpc(
    upcs: string[],
  ): Promise<Map<string, MetadataRow>> {
    const map = new Map<string, MetadataRow>();
    if (!upcs.length) return map;

    const rows = await this.entityManager.query(
      `
        SELECT
          r.upc AS upc,
          COALESCE(NULLIF(ten.title, ''), ten.name, '') AS workspace_name,
          r.title AS release_title,
          COALESCE(r.upc, '') AS release_upc,
          COALESCE(r.catalog_id, '') AS catalog_id,
          r.release_date AS release_date,
          '' AS track_title,
          COALESCE(l.name, '') AS label_name,
          COALESCE(string_agg(DISTINCT a.name, ', '), '') AS artist_names
        FROM releases r
        LEFT JOIN labels l ON l.id = r.label_id
        LEFT JOIN tenants ten ON ten.id = r.tenant_id
        LEFT JOIN release_artist ra ON ra.release_id = r.id
        LEFT JOIN artists a ON a.id = ra.artist_id
        WHERE r.upc = ANY($1)
        GROUP BY r.upc, ten.title, ten.name, r.title, r.catalog_id, r.release_date, l.name
      `,
      [upcs],
    );

    for (const row of rows) {
      map.set(row.upc, row);
    }
    return map;
  }

  private async toWorkbook(
    summary: SummaryRow,
    details: DetailRow[],
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'ag-release-server';
    workbook.created = new Date();

    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.columns = [
      { header: 'StartDate', key: 'startDate', width: 14 },
      { header: 'EndDate', key: 'endDate', width: 14 },
      { header: 'TotalUsage', key: 'totalUsage', width: 14 },
      { header: 'RevenueUsd', key: 'revenueUsd', width: 18 },
      { header: 'Currency', key: 'currency', width: 10 },
      { header: 'TrackCount', key: 'trackCount', width: 12 },
      { header: 'ReleaseCount', key: 'releaseCount', width: 14 },
      { header: 'LabelCount', key: 'labelCount', width: 12 },
      { header: 'DspCount', key: 'dspCount', width: 12 },
      { header: 'TerritoryCount', key: 'territoryCount', width: 15 },
    ];
    summarySheet.addRow(summary);
    this.styleSheet(summarySheet);

    const detailSheet = workbook.addWorksheet('Detail');
    detailSheet.columns = this.getDetailColumns();
    detailSheet.addRows(details);
    this.styleSheet(detailSheet);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private async writeWorkbookFile(
    filePath: string,
    summary: SummaryRow,
    tenantId: string,
    dto: AnalyticsReportExportDto,
    range: { startDate: string; endDate: string },
    trackIsrc: string | null,
    onProgress?: (patch: ExportProgressPatch, force?: boolean) => Promise<void>,
    jobId?: string,
  ): Promise<number> {
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      filename: filePath,
      useStyles: true,
      useSharedStrings: false,
    });

    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.columns = [
      { header: 'StartDate', key: 'startDate', width: 14 },
      { header: 'EndDate', key: 'endDate', width: 14 },
      { header: 'TotalUsage', key: 'totalUsage', width: 14 },
      { header: 'RevenueUsd', key: 'revenueUsd', width: 18 },
      { header: 'Currency', key: 'currency', width: 10 },
      { header: 'TrackCount', key: 'trackCount', width: 12 },
      { header: 'ReleaseCount', key: 'releaseCount', width: 14 },
      { header: 'LabelCount', key: 'labelCount', width: 12 },
      { header: 'DspCount', key: 'dspCount', width: 12 },
      { header: 'TerritoryCount', key: 'territoryCount', width: 15 },
    ];
    summarySheet.addRow(summary).commit();
    summarySheet.commit();

    const detailSheet = workbook.addWorksheet('Detail');
    detailSheet.columns = this.getDetailColumns();

    let offset = 0;
    let totalRows = 0;
    let detailCommitted = false;
    let workbookCommitted = false;
    try {
      while (true) {
        await this.throwIfExportJobCancelled(jobId);
        const rawRows = await this.getRawDetailsPage(
          tenantId,
          dto,
          range,
          trackIsrc,
          this.batchSize,
          offset,
        );
        if (!rawRows.length) break;
        await this.throwIfExportJobCancelled(jobId);

        const details = await this.enrichDetails(rawRows);
        for (const row of details) {
          detailSheet.addRow(row).commit();
        }
        totalRows += rawRows.length;
        await onProgress?.(
          {
            progressCurrent: 2,
            progressLabel: `Writing report file (${totalRows} rows)`,
            processedRows: totalRows,
          },
          false,
        );
        await this.throwIfExportJobCancelled(jobId);

        if (rawRows.length < this.batchSize) break;
        offset += this.batchSize;
      }

      detailSheet.commit();
      detailCommitted = true;
      await workbook.commit();
      workbookCommitted = true;
    } finally {
      if (!detailCommitted) {
        detailSheet.commit();
      }
      if (!workbookCommitted) {
        await workbook.commit().catch(() => undefined);
      }
    }
    return totalRows;
  }

  private async writeCsvFile(
    filePath: string,
    tenantId: string,
    dto: AnalyticsReportExportDto,
    range: { startDate: string; endDate: string },
    trackIsrc: string | null,
    onProgress?: (patch: ExportProgressPatch, force?: boolean) => Promise<void>,
    jobId?: string,
  ): Promise<number> {
    const stream = fs.createWriteStream(filePath, { encoding: 'utf8' });
    const columns = this.getDetailColumns();
    const headers = columns.map((col) => col.header?.toString() ?? '');
    const keys = columns.map((col) => col.key?.toString() ?? '');
    await this.writeStreamLine(
      stream,
      `\uFEFF${headers.map((h) => this.csvEscape(h)).join(',')}\n`,
    );

    let offset = 0;
    let totalRows = 0;
    try {
      while (true) {
        await this.throwIfExportJobCancelled(jobId);
        const rawRows = await this.getRawDetailsPage(
          tenantId,
          dto,
          range,
          trackIsrc,
          this.batchSize,
          offset,
        );
        if (!rawRows.length) break;
        await this.throwIfExportJobCancelled(jobId);

        const details = await this.enrichDetails(rawRows);
        for (const row of details) {
          const record = row as unknown as Record<string, unknown>;
          await this.writeStreamLine(
            stream,
            `${keys.map((key) => this.csvEscape(record[key])).join(',')}\n`,
          );
        }
        totalRows += rawRows.length;
        await onProgress?.(
          {
            progressCurrent: 2,
            progressLabel: `Writing report file (${totalRows} rows)`,
            processedRows: totalRows,
          },
          false,
        );
        await this.throwIfExportJobCancelled(jobId);

        if (rawRows.length < this.batchSize) break;
        offset += this.batchSize;
      }
    } finally {
      await new Promise<void>((resolve, reject) => {
        stream.end((err?: Error | null) => (err ? reject(err) : resolve()));
      });
    }
    return totalRows;
  }

  private async writeStreamLine(
    stream: fs.WriteStream,
    line: string,
  ): Promise<void> {
    if (!stream.write(line)) {
      await once(stream, 'drain');
    }
  }

  private getDetailColumns(): Partial<ExcelJS.Column>[] {
    return [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Workspace', key: 'tenant', width: 28 },
      { header: 'DspName', key: 'dspName', width: 28 },
      { header: 'UPC', key: 'upc', width: 18 },
      { header: 'ISRC', key: 'isrc', width: 18 },
      { header: 'ReleaseName', key: 'releaseName', width: 32 },
      { header: 'TrackName', key: 'trackName', width: 32 },
      { header: 'ArtistName', key: 'artistName', width: 28 },
      { header: 'LabelName', key: 'labelName', width: 28 },
      { header: 'Territory', key: 'territory', width: 12 },
      { header: 'TotalUsage', key: 'totalUsage', width: 14 },
      { header: 'RevenueUsd', key: 'revenueUsd', width: 18 },
      { header: 'Currency', key: 'currency', width: 10 },
    ];
  }

  private styleSheet(sheet: ExcelJS.Worksheet) {
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).alignment = { vertical: 'middle' };
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: sheet.columnCount },
    };
  }

  private toCsv(details: DetailRow[]): string {
    const columns = this.getDetailColumns();
    const headers = columns.map((col) => col.header?.toString() ?? '');
    const keys = columns.map((col) => col.key?.toString() ?? '');
    const lines = [headers.map((h) => this.csvEscape(h)).join(',')];

    for (const row of details) {
      const record = row as unknown as Record<string, unknown>;
      lines.push(keys.map((key) => this.csvEscape(record[key])).join(','));
    }

    return lines.join('\n');
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
