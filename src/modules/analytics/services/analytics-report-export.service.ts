import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectEntityManager } from '@nestjs/typeorm';
import * as ExcelJS from 'exceljs';
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
import { zipFolder } from 'src/utils/util';
import { EntityManager } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { AnalyticsReportExportDto } from '../dto/analytics-report-export.dto';
import {
  AnalyticsReportExportResult,
  AnalyticsReportExportJobResult,
  AnalyticsReportExportCancelResult,
  AnalyticsReportExportCancelAllResult,
  AnalyticsReportExportCancelListResult,
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
import { ExportQueueService } from './export-queue.service';

class ExportJobCancelledError extends Error {
  constructor(jobId: string) {
    super(`Export job ${jobId} was cancelled`);
    this.name = ExportJobCancelledError.name;
  }
}

@Injectable()
export class AnalyticsReportExportService implements OnModuleInit {
  private readonly logger = new Logger(AnalyticsReportExportService.name);
  private readonly batchSize = 100_000;
  private readonly exportRetentionDays = 7;
  private readonly cleanupBatchSize = 100;
  private readonly cancelledExportJobs = new Set<string>();
  private readonly maxConcurrentWorkers = 10;
  private isRunning = false;

  // Global metadata cache shared across concurrent jobs (TTL 10 min)
  private readonly METADATA_CACHE_TTL_MS = 10 * 60 * 1000;
  private readonly globalTrackMeta = new Map<string, MetadataRow>();
  private readonly globalReleaseMeta = new Map<string, MetadataRow>();
  private readonly globalTenantNames = new Map<string, string>();
  private globalCacheRefreshedAt = 0;

  constructor(
    private readonly clickHouseService: ClickHouseService,
    private readonly r2Service: BucketR2Service,
    private readonly importJobsService: ImportJobsService,
    private readonly exportQueueService: ExportQueueService,
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
  ) {}

  async onModuleInit() {
    await this.exportQueueService.redeliverStuck();
    this.isRunning = true;
    for (let i = 0; i < this.maxConcurrentWorkers; i++) {
      this.startWorker(i);
    }
    this.logger.log(`Started ${this.maxConcurrentWorkers} export workers`);
  }

  private startWorker(workerId: number) {
    setImmediate(async () => {
      while (this.isRunning) {
        try {
          const jobId = await this.exportQueueService.dequeue();
          if (jobId) {
            this.logger.log(`Worker-${workerId} picked up export job ${jobId}`);
            const job = await this.importJobsService.findById(jobId);
            if (job && !this.isTerminalStatus(job.status)) {
              await this.runExportJob(
                jobId,
                job.tenantId || '',
                job.params as unknown as AnalyticsReportExportDto,
              );
            }
            await this.exportQueueService.ack(jobId);
          } else {
            await new Promise((r) => setTimeout(r, 2000));
          }
        } catch (err: any) {
          this.logger.error(`Worker-${workerId} error: ${err.message}`, err.stack);
          await new Promise((r) => setTimeout(r, 3000));
        }
      }
    });
  }

  async createExportJob(
    tenantId: string,
    userId: string,
    dto: AnalyticsReportExportDto,
  ): Promise<AnalyticsReportExportJobResult> {
    const tenantNamesMap = await this.getTenantNames([tenantId]);
    const tenantName = tenantNamesMap.get(tenantId) || 'unnamed_workspace';
    const job = await this.importJobsService.create({
      sourceType: ImportJobSourceType.ANALYTICS_REPORT_EXPORT,
      params: dto as unknown as Record<string, unknown>,
      fileName: this.buildFileName(tenantName, dto),
      progressTotal: 4,
      tenantId,
      createdBy: userId,
    });

    await this.importJobsService.markQueued(job.id);

    await this.exportQueueService.enqueue(job.id);

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

    const tenantNamesMap = await this.getTenantNames([tenantId]);
    const tenantName = tenantNamesMap.get(tenantId) || 'unnamed_workspace';
    const fileName = this.buildFileName(tenantName, dto);
    const tempDir = path.join(os.tmpdir(), `export-split-${uuidv4()}`);
    const zipPath = path.join(os.tmpdir(), `${uuidv4()}-${fileName}`);
    const key = `exports/analytics/${tenantId}/${uuidv4()}-${fileName}`;
    const format = dto.format ?? 'csv';
    const groups = new Map<string, GroupState>();

    try {
      await fs.promises.mkdir(tempDir, { recursive: true });

      // Step 1: Pre-fetch all metadata into global cache
      await onProgress?.({ progressCurrent: 1, progressLabel: 'Pre-fetching metadata' }, true);
      await this.throwIfExportJobCancelled(jobId);
      await this.prefetchMetadata(tenantId, dto, range, trackIsrc);

      // Step 2: Stream batches → enrich → write directly to group files
      await onProgress?.({ progressCurrent: 2, progressLabel: 'Streaming data' }, true);
      const stringPool = new Map<string, string>();
      let offset = 0;
      let totalRows = 0;

      while (true) {
        await this.throwIfExportJobCancelled(jobId);
        const rawRows = await this.getRawDetailsPage(
          tenantId, dto, range, trackIsrc, this.batchSize, offset,
        );
        if (!rawRows.length) break;

        for (const raw of rawRows) {
          const detail = this.enrichSingleRow(raw, stringPool);
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
        }

        await onProgress?.({
          progressCurrent: 2,
          progressLabel: `Streaming data (${totalRows} rows)`,
          processedRows: totalRows,
        }, false);
        if (rawRows.length < this.batchSize) break;
        offset += this.batchSize;
      }
      stringPool.clear();

      // Step 3: Flush writers, write summaries
      await onProgress?.({ progressCurrent: 3, progressLabel: `Finalizing ${groups.size} folders` }, true);
      for (const [gk, group] of groups) {
        await this.throwIfExportJobCancelled(jobId);
        await group.writer.flush();
        const summary = this.buildSummaryFromAccumulator(group.summary, gk, dto);
        await this.writeSummaryFile(path.join(tempDir, gk, `summary.${format}`), summary, format);
      }

      // Step 4: ZIP + Upload
      await onProgress?.({ progressCurrent: 3, progressLabel: 'Creating ZIP archive' }, true);
      await this.throwIfExportJobCancelled(jobId);
      await zipFolder(tempDir, zipPath);

      await onProgress?.({
        progressCurrent: 4, progressLabel: 'Uploading ZIP file',
        processedRows: totalRows, totalRows,
      }, true);
      await this.throwIfExportJobCancelled(jobId);

      await this.r2Service.uploadFileFromPath({ key, filePath: zipPath, contentType: 'application/zip', isPublic: false });

      return {
        fileName, key,
        downloadUrl: await this.r2Service.getSignedUrlDown({ key, fileName, isPublic: false }),
        expiresInSeconds: 4 * 3600,
        totalRows,
      };
    } finally {
      for (const [, g] of groups) {
        await g.writer.flush().catch(() => {});
      }
      await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
      await fs.promises.unlink(zipPath).catch(() => undefined);
    }
  }

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
        `\uFEFF${headers.map((h) => this.csvEscape(h)).join(',')}`,
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

  private async prefetchMetadata(
    tenantId: string,
    dto: AnalyticsReportExportDto,
    range: ReturnType<typeof this.getMonthRange>,
    trackIsrc: string | null,
  ): Promise<void> {
    const now = Date.now();
    if (now - this.globalCacheRefreshedAt < this.METADATA_CACHE_TTL_MS) {
      this.logger.log('Using active global metadata cache');
      return; // Cache is still fresh
    }

    this.logger.log('Refreshing global metadata cache for unique identifiers...');
    const filters = this.buildFilters(tenantId, dto, trackIsrc);
    const uniqueIdentifiersSql = getUniqueIdentifiersQuery(
      this.getCommonJoins(),
      filters.whereSql,
    );

    const rows = await this.clickHouseService.query<any>(
      uniqueIdentifiersSql,
      filters.params,
    );

    const uniqueIsrcs = new Set<string>();
    const uniqueTenantIds = new Set<string>();

    for (const row of rows) {
      if (row.isrc) uniqueIsrcs.add(row.isrc);
      if (row.tenant_id) uniqueTenantIds.add(row.tenant_id);
    }

    const isrcs = Array.from(uniqueIsrcs);
    const tenantIds = Array.from(uniqueTenantIds);

    this.logger.log(`Found ${isrcs.length} unique ISRCs and ${tenantIds.length} tenants`);

    const BATCH = 5000;
    this.globalTrackMeta.clear();
    this.globalReleaseMeta.clear();
    this.globalTenantNames.clear();

    for (let i = 0; i < isrcs.length; i += BATCH) {
      const batchIsrcs = isrcs.slice(i, i + BATCH);
      const trackMap = await this.getTrackMetadata(batchIsrcs);
      
      const upcsToFetch = new Set<string>();
      for (const [isrc, track] of trackMap) {
        this.globalTrackMeta.set(isrc, track);
        if (track.release_upc) upcsToFetch.add(track.release_upc);
      }

      if (upcsToFetch.size > 0) {
        const releaseMap = await this.getReleaseMetadataByUpc(Array.from(upcsToFetch));
        for (const [upc, release] of releaseMap) {
          this.globalReleaseMeta.set(upc, release);
        }
      }
    }

    if (tenantIds.length > 0) {
      const tenantMap = await this.getTenantNames(tenantIds);
      for (const [tid, tname] of tenantMap) {
        this.globalTenantNames.set(tid, tname);
      }
    }

    this.globalCacheRefreshedAt = Date.now();
  }

  private enrichSingleRow(
    raw: RawDetailRow,
    stringPool: Map<string, string>,
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
    const trackInfo = isrc ? this.globalTrackMeta.get(isrc) : null;
    const isStandardUpc = isValidStandardUpc(raw.fallback_upc || '');
    const upcToLookup = isStandardUpc ? raw.fallback_upc : trackInfo?.release_upc;
    const releaseInfo = upcToLookup ? this.globalReleaseMeta.get(upcToLookup) : null;

    const baseInfo = trackInfo || releaseInfo;
    const finalTenantName = raw.tenant_id 
      ? this.globalTenantNames.get(raw.tenant_id) 
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

  /** Sanitize a string for use as a file/directory name. */
  private sanitizeFileName(name: string): string {
    return name
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .substring(0, 100) || 'unnamed';
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

  private buildFileName(tenantName: string, dto: AnalyticsReportExportDto): string {
    const sanitized = this.sanitizeFileName(tenantName);
    const pad = (n: number) => String(n).padStart(2, '0');
    const now = new Date();
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    return `${sanitized}_analytics-report_${dto.fromDate}_${dto.endDate}_${timestamp}.zip`;
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

    // Multi-tenant: use dto.tenantIds if provided, otherwise fall back
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

    const query = getRawDetailsPageQuery(
      resolvedDspName,
      this.getCommonJoins(),
      whereSql,
      pagingSql,
    );

    return this.clickHouseService.query<RawDetailRow>(query, params);
  }


  private isGeneratedUpcBackfill(value: string): boolean {
    return value.trim().toUpperCase().startsWith('UPC-');
  }
  private async getTrackMetadata(isrcs: string[]): Promise<Map<string, MetadataRow>> {
    const map = new Map<string, MetadataRow>();
    if (!isrcs.length) return map;

    const rows = await this.entityManager.query(
      getTrackMetadataQuery(),
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

    const validUuidTenantIds = tenantIds.filter((id) => {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
      if (!isUuid && id === 'system-tenant') {
        map.set(id, 'System Tenant');
      }
      return isUuid;
    });

    if (!validUuidTenantIds.length) return map;

    const rows = await this.entityManager.query(
      getTenantNamesQuery(),
      [validUuidTenantIds],
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
      getReleaseMetadataByUpcQuery(),
      [upcs],
    );

    for (const row of rows) {
      map.set(row.upc, row);
    }
    return map;
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
      { header: 'Revenue', key: 'revenueUsd', width: 18 },
      { header: 'Currency', key: 'currency', width: 10 },
    ];
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
