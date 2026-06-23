import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
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
} from '../queries/analytics-report-export.queries';

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
    return this.exportReportSplit(tenantId, dto, onProgress, jobId);
  }

  /**
   * Export with split mode — query all data, group by split key,
   * write individual files, then zip them using existing zipFolder util.
   */
  private async exportReportSplit(
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

    try {
      await fs.promises.mkdir(tempDir, { recursive: true });

      // Step 1: Query all data in batches
      await onProgress?.(
        { progressCurrent: 1, progressLabel: 'Querying data' },
        true,
      );
      await this.throwIfExportJobCancelled(jobId);

      const allDetails: DetailRow[] = [];
      let offset = 0;
      while (true) {
        await this.throwIfExportJobCancelled(jobId);
        const rawRows = await this.getRawDetailsPage(
          tenantId, dto, range, trackIsrc, this.batchSize, offset,
        );
        if (!rawRows.length) break;
        const enriched = await this.enrichDetails(rawRows);
        allDetails.push(...enriched);
        await onProgress?.(
          {
            progressCurrent: 1,
            progressLabel: `Querying data (${allDetails.length} rows)`,
            processedRows: allDetails.length,
          },
          false,
        );
        if (rawRows.length < this.batchSize) break;
        offset += this.batchSize;
      }

      // Step 2: Group data into nested folders
      await onProgress?.(
        { progressCurrent: 2, progressLabel: 'Splitting data into groups' },
        true,
      );
      await this.throwIfExportJobCancelled(jobId);

      const groups = this.groupDetailRowsNew(allDetails, dto);

      // Step 3: Write each group as folder with summary + detail files
      await onProgress?.(
        { progressCurrent: 2, progressLabel: `Writing ${groups.size} folders` },
        true,
      );

      let filesWritten = 0;
      const format = dto.format ?? 'xlsx';
      for (const [groupPath, rows] of groups) {
        await this.throwIfExportJobCancelled(jobId);

        const groupFolder = path.join(tempDir, groupPath);
        await fs.promises.mkdir(groupFolder, { recursive: true });

        // Calculate summary
        const summary = this.calculateSummary(rows, groupPath, dto);

        // Write summary.[format]
        const summaryFilePath = path.join(groupFolder, `summary.${format}`);
        await this.writeSummaryFile(summaryFilePath, summary, format);

        // Write detail.[format]
        const detailFilePath = path.join(groupFolder, `detail.${format}`);
        await this.writeDetailFile(detailFilePath, rows, format);

        filesWritten++;
        await onProgress?.(
          {
            progressCurrent: 2,
            progressLabel: `Writing folder ${filesWritten}/${groups.size}`,
          },
          false,
        );
      }

      // Step 4: Create ZIP using existing utility
      await onProgress?.(
        { progressCurrent: 3, progressLabel: 'Creating ZIP archive' },
        true,
      );
      await this.throwIfExportJobCancelled(jobId);
      await zipFolder(tempDir, zipPath);

      // Step 5: Upload to R2
      await onProgress?.(
        {
          progressCurrent: 3,
          progressLabel: 'Uploading ZIP file',
          processedRows: allDetails.length,
          totalRows: allDetails.length,
        },
        true,
      );
      await this.throwIfExportJobCancelled(jobId);

      await this.r2Service.uploadFileFromPath({
        key,
        filePath: zipPath,
        contentType: 'application/zip',
        isPublic: false,
      });
      await this.throwIfExportJobCancelled(jobId);

      return {
        fileName,
        key,
        downloadUrl: await this.r2Service.getSignedUrlDown({
          key, fileName, isPublic: false,
        }),
        expiresInSeconds: 4 * 3600,
        totalRows: allDetails.length,
      };
    } finally {
      await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
      await fs.promises.unlink(zipPath).catch(() => undefined);
    }
  }

  private groupDetailRowsNew(
    rows: DetailRow[],
    dto: AnalyticsReportExportDto,
  ): Map<string, DetailRow[]> {
    const groups = new Map<string, DetailRow[]>();
    const isExportArtist = dto.isExportArtist === true || (dto.isExportArtist as any) === 'true';
    const periodUnit = dto.periodUnit || 'none';

    for (const row of rows) {
      const tenantFolder = this.sanitizeFileName(row.tenant || 'unnamed_workspace');

      // 1. Add to tenant root folder
      const tenantRootPath = tenantFolder;
      if (!groups.has(tenantRootPath)) {
        groups.set(tenantRootPath, []);
      }
      groups.get(tenantRootPath)!.push(row);

      // 2. Period folders
      if (periodUnit === 'month' || periodUnit === 'quarter') {
        const periodKey = this.getPeriodKey(row.date, periodUnit);
        const periodPath = `${tenantFolder}/${periodKey}`;
        if (!groups.has(periodPath)) {
          groups.set(periodPath, []);
        }
        groups.get(periodPath)!.push(row);

        // 3. Artist folders inside period folder
        if (isExportArtist) {
          const artistFolder = this.sanitizeFileName(row.artistName || 'unnamed_artist');
          const artistPeriodPath = `${tenantFolder}/${periodKey}/${artistFolder}`;
          if (!groups.has(artistPeriodPath)) {
            groups.set(artistPeriodPath, []);
          }
          groups.get(artistPeriodPath)!.push(row);
        }
      } else {
        // No period, but artist subfolders under tenant root
        if (isExportArtist) {
          const artistFolder = this.sanitizeFileName(row.artistName || 'unnamed_artist');
          const artistPath = `${tenantFolder}/${artistFolder}`;
          if (!groups.has(artistPath)) {
            groups.set(artistPath, []);
          }
          groups.get(artistPath)!.push(row);
        }
      }
    }

    return groups;
  }

  private getPeriodKey(date: string, unit: string): string {
    if (unit === 'quarter' || unit === 'quater') {
      const [year, month] = date.split('-').map(Number);
      const quarter = Math.ceil(month / 3);
      return `${year}-Q${quarter}`;
    }
    return date;
  }

  private calculateSummary(
    rows: DetailRow[],
    groupPath: string,
    dto: AnalyticsReportExportDto,
  ): SummaryRow {
    const firstRow = rows[0];
    const tenantName = firstRow?.tenant || 'unnamed_workspace';
    
    const parts = groupPath.split('/');
    let artistName = '';
    let period = '';

    const periodUnit = dto.periodUnit || 'none';
    const isExportArtist = dto.isExportArtist === true || (dto.isExportArtist as any) === 'true';

    if (parts.length === 2) {
      if (periodUnit === 'month' || periodUnit === 'quarter') {
        period = parts[1];
      } else if (isExportArtist) {
        artistName = firstRow?.artistName || parts[1];
      }
    } else if (parts.length === 3) {
      period = parts[1];
      artistName = firstRow?.artistName || parts[2];
    }

    const revenueSumStr = this.addRevenueExact(rows.map(r => r.revenueUsd));
    const totalUsage = rows.reduce((acc, r) => acc + (r.totalUsage || 0), 0);

    const uniqueIsrcs = new Set(rows.map(r => r.isrc).filter(Boolean));
    const uniqueReleases = new Set(rows.map(r => r.releaseName || r.upc).filter(Boolean));
    const uniqueLabels = new Set(rows.map(r => r.labelName).filter(Boolean));
    const uniqueDsps = new Set(rows.map(r => r.dspName).filter(Boolean));
    const uniqueTerritories = new Set(rows.map(r => r.territory).filter(Boolean));
    const uniqueArtists = new Set(rows.map(r => r.artistName).filter(Boolean));

    const startDates = rows.map(r => r.startDate).filter(Boolean);
    const endDates = rows.map(r => r.endDate).filter(Boolean);
    const startDate = startDates.length ? startDates.reduce((min, d) => d < min ? d : min, startDates[0]) : `${dto.fromDate}-01`;
    const endDate = endDates.length ? endDates.reduce((max, d) => d > max ? d : max, endDates[0]) : this.lastDayOfMonth(dto.endDate);

    return {
      startDate,
      endDate,
      tenantName,
      artistName: artistName || undefined,
      period: period || undefined,
      totalUsage,
      revenueUsd: revenueSumStr,
      currency: 'USD',
      trackCount: uniqueIsrcs.size,
      releaseCount: uniqueReleases.size,
      labelCount: uniqueLabels.size,
      dspCount: uniqueDsps.size,
      territoryCount: uniqueTerritories.size,
      artistCount: uniqueArtists.size,
    } as any;
  }

  private addRevenueExact(values: string[]): string {
    let sum = 0;
    for (const val of values) {
      const parsed = parseFloat(val);
      if (!isNaN(parsed)) {
        sum += parsed;
      }
    }
    return sum.toFixed(2);
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

  private async writeDetailFile(
    filePath: string,
    rows: DetailRow[],
    format: 'xlsx' | 'csv',
  ): Promise<void> {
    if (format === 'csv') {
      const columns = this.getDetailColumns();
      const headers = columns.map((c) => c.header?.toString() ?? '');
      const keys = columns.map((c) => c.key?.toString() ?? '');
      const lines = [`\uFEFF${headers.map((h) => this.csvEscape(h)).join(',')}`];
      for (const row of rows) {
        const record = row as unknown as Record<string, unknown>;
        lines.push(keys.map((key) => this.csvEscape(record[key])).join(','));
      }
      await fs.promises.writeFile(filePath, lines.join('\n'), 'utf8');
    } else {
      const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
        filename: filePath,
        useStyles: true,
        useSharedStrings: false,
      });
      const sheet = workbook.addWorksheet('Detail');
      sheet.columns = this.getDetailColumns();
      for (const row of rows) {
        sheet.addRow(row).commit();
      }
      sheet.commit();
      await workbook.commit();
    }
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
    return `${sanitized}_analytics-report_${dto.fromDate}_${dto.endDate}.zip`;
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
