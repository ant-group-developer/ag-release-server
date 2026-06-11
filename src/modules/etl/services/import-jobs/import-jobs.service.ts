import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { ClickHouseService, CLICKHOUSE_TABLES } from '../../../clickhouse';
import {
  CreateImportJobInput,
  ImportJob,
  ImportJobRow,
  ImportJobSourceType,
  ImportJobStatus,
  ListImportJobsFilters,
  UpdateProgressPatch,
} from '../../interfaces';
import { JobEventsGateway } from './job-events.gateway';

/**
 * ImportJobsService — quản lý vòng đời job import / sync, lưu vào
 * `music_analytics.import_jobs` (ReplacingMergeTree).
 *
 * Pattern update: mỗi service giữ in-memory snapshot per-job. Khi gọi
 * markX() / updateProgress() → mutate snapshot + insert row mới với
 * `updated_at` mới. Đọc qua FINAL để lấy state cuối cùng đã merge.
 *
 * Throttle progress updates: `updateProgress` mặc định flush mỗi 1s
 * để tránh spam insert vào ClickHouse khi parser flush 50K rows liên tục.
 */
@Injectable()
export class ImportJobsService implements OnModuleInit {
  private readonly logger = new Logger(ImportJobsService.name);
  private readonly snapshots = new Map<string, ImportJob>();
  private readonly lastFlushAt = new Map<string, number>();
  private static readonly PROGRESS_FLUSH_MS = 1000;

  constructor(
    private readonly clickHouseService: ClickHouseService,
    private readonly jobEvents: JobEventsGateway,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.markStaleAsFailed();
    } catch (err) {
      this.logger.warn(`Crash recovery sweep failed: ${err.message}`);
    }
  }

  async create(input: CreateImportJobInput): Promise<ImportJob> {
    const now = nowDt64();
    const job: ImportJob = {
      id: uuidv4(),
      sourceType: input.sourceType,
      status: ImportJobStatus.PENDING,
      fileName: input.fileName ?? '',
      filePath: input.filePath ?? '',
      fileSizeBytes: input.fileSizeBytes ?? 0,
      fileHash: input.fileHash ?? '',
      params: input.params ?? {},
      progressCurrent: 0,
      progressTotal: input.progressTotal ?? 0,
      progressLabel: '',
      totalRows: 0,
      processedRows: 0,
      skippedRows: 0,
      errorRows: 0,
      result: null,
      errorMessage: '',
      batchId: '',
      tenantId: input.tenantId ?? '',
      createdBy: input.createdBy ?? '',
      createdAt: now,
      startedAt: null,
      finishedAt: null,
      durationMs: 0,
      updatedAt: now,
    };
    this.snapshots.set(job.id, job);
    await this.persist(job);
    this.logger.log(`Job ${job.id} created (${job.sourceType})`);
    return job;
  }

  async markProcessing(id: string): Promise<void> {
    const job = await this.requireSnapshot(id);
    job.status = ImportJobStatus.PROCESSING;
    job.startedAt = nowDt64();
    await this.persist(job);
  }

  /**
   * Update progress fields. Throttle 1s/job để tránh spam ClickHouse insert.
   * `force=true` flush ngay (dùng khi đổi step lớn / kết thúc job).
   */
  async updateProgress(
    id: string,
    patch: UpdateProgressPatch,
    force = false,
  ): Promise<void> {
    const job = this.snapshots.get(id);
    if (!job) return;

    if (patch.progressCurrent !== undefined) job.progressCurrent = patch.progressCurrent;
    if (patch.progressTotal !== undefined) job.progressTotal = patch.progressTotal;
    if (patch.progressLabel !== undefined) job.progressLabel = patch.progressLabel;
    if (patch.processedRows !== undefined) job.processedRows = patch.processedRows;
    if (patch.skippedRows !== undefined) job.skippedRows = patch.skippedRows;
    if (patch.errorRows !== undefined) job.errorRows = patch.errorRows;
    if (patch.totalRows !== undefined) job.totalRows = patch.totalRows;

    const lastFlush = this.lastFlushAt.get(id) ?? 0;
    if (!force && Date.now() - lastFlush < ImportJobsService.PROGRESS_FLUSH_MS) return;

    await this.persist(job);
  }

  async markCompleted(id: string, result: Record<string, unknown>): Promise<void> {
    const job = await this.requireSnapshot(id);
    job.status = ImportJobStatus.COMPLETED;
    job.result = result;
    job.finishedAt = nowDt64();
    job.durationMs = computeDurationMs(job.startedAt, job.finishedAt);
    await this.persist(job);
    this.cleanup(id);
    this.logger.log(`Job ${id} COMPLETED in ${job.durationMs}ms`);
  }

  async markFailed(id: string, error: Error | string): Promise<void> {
    const job = await this.requireSnapshot(id);
    job.status = ImportJobStatus.FAILED;
    job.errorMessage = error instanceof Error ? error.message : String(error);
    job.finishedAt = nowDt64();
    job.durationMs = computeDurationMs(job.startedAt, job.finishedAt);
    await this.persist(job);
    this.cleanup(id);
    this.logger.error(`Job ${id} FAILED: ${job.errorMessage}`);
  }

  async setBatchId(id: string, batchId: string): Promise<void> {
    const job = this.snapshots.get(id);
    if (!job) return;
    job.batchId = batchId;
    await this.persist(job);
  }

  /**
   * Get in-memory snapshot of a job (no ClickHouse query).
   * Used to avoid ReplacingMergeTree eventual-consistency race conditions
   * when a job was just created and might not be visible via FINAL query yet.
   */
  getSnapshot(id: string): ImportJob | null {
    return this.snapshots.get(id) ?? null;
  }

  async findById(id: string): Promise<ImportJob | null> {
    const sql = `
      SELECT * FROM ${CLICKHOUSE_TABLES.IMPORT_JOBS} FINAL
      WHERE id = {id:String}
      LIMIT 1
    `;
    const rows = await this.clickHouseService.query<ImportJobRow>(sql, { id });
    if (!rows.length) return null;
    return rowToDomain(rows[0]);
  }

  async list(filters: ListImportJobsFilters = {}): Promise<{
    items: ImportJob[];
    totalItems: number;
  }> {
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    const offset = Math.max(filters.offset ?? 0, 0);

    const where: string[] = [];
    const params: Record<string, unknown> = { limit, offset };
    if (filters.sourceType) {
      where.push('source_type = {sourceType:String}');
      params.sourceType = filters.sourceType;
    }
    if (filters.status) {
      where.push('status = {status:String}');
      params.status = filters.status;
    }
    if (filters.tenantId) {
      where.push('tenant_id = {tenantId:String}');
      params.tenantId = filters.tenantId;
    }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    // Query 1: Count total jobs
    const countSql = `
      SELECT count() AS total FROM (
        SELECT 1 FROM ${CLICKHOUSE_TABLES.IMPORT_JOBS} FINAL
        ${whereClause}
      )
    `;
    const countResult = await this.clickHouseService.query<{ total: string }>(
      countSql,
      params,
    );
    const totalItems = Number(countResult[0]?.total ?? 0);

    if (totalItems === 0) {
      return { items: [], totalItems: 0 };
    }

    // Query 2: Get paged jobs
    const sql = `
      SELECT * FROM ${CLICKHOUSE_TABLES.IMPORT_JOBS} FINAL
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT {limit:UInt32} OFFSET {offset:UInt32}
    `;
    const rows = await this.clickHouseService.query<ImportJobRow>(sql, params);
    return { items: rows.map(rowToDomain), totalItems };
  }

  /**
   * Crash recovery: mark mọi job đang PROCESSING thành FAILED khi server start.
   * Vì process cũ đã chết, không thể tiếp tục.
   */
  private async markStaleAsFailed(): Promise<void> {
    const sql = `
      SELECT id, started_at FROM ${CLICKHOUSE_TABLES.IMPORT_JOBS} FINAL
      WHERE status = {status:String}
    `;
    const stale = await this.clickHouseService.query<{
      id: string;
      started_at: string | null;
    }>(sql, { status: ImportJobStatus.PROCESSING });

    if (!stale.length) return;
    this.logger.warn(`Crash recovery: marking ${stale.length} stale PROCESSING job(s) as FAILED`);

    const now = nowDt64();
    const rows: ImportJobRow[] = [];
    for (const s of stale) {
      const existing = await this.findById(s.id);
      if (!existing) continue;
      const updated: ImportJob = {
        ...existing,
        status: ImportJobStatus.FAILED,
        errorMessage: 'Server restarted while processing',
        finishedAt: now,
        durationMs: computeDurationMs(existing.startedAt, now),
        updatedAt: now,
      };
      rows.push(domainToRow(updated));
    }
    if (rows.length) {
      await this.clickHouseService.insert(
        CLICKHOUSE_TABLES.IMPORT_JOBS,
        rows as unknown as Record<string, unknown>[],
      );
    }
  }

  private async persist(job: ImportJob): Promise<void> {
    job.updatedAt = nowDt64();
    await this.clickHouseService.insert(
      CLICKHOUSE_TABLES.IMPORT_JOBS,
      [domainToRow(job)] as unknown as Record<string, unknown>[],
    );
    this.lastFlushAt.set(job.id, Date.now());

    this.jobEvents.emit({
      jobId: job.id,
      type: job.status === ImportJobStatus.COMPLETED
        ? 'completed'
        : job.status === ImportJobStatus.FAILED
        ? 'failed'
        : 'progress',
      data: {
        id: job.id,
        sourceType: job.sourceType,
        status: job.status,
        progress: {
          current: job.progressCurrent,
          total: job.progressTotal,
          label: job.progressLabel,
        },
        rows: {
          total: job.totalRows,
          processed: job.processedRows,
          skipped: job.skippedRows,
          errors: job.errorRows,
        },
        file: job.fileName
          ? { name: job.fileName, sizeBytes: job.fileSizeBytes, hash: job.fileHash || null }
          : null,
        params: job.params,
        result: job.result,
        error: job.errorMessage || null,
        batchId: job.batchId || null,
        tenantId: job.tenantId || null,
        createdBy: job.createdBy || null,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
        durationMs: job.durationMs,
      },
      timestamp: job.updatedAt,
    });
  }

  private async requireSnapshot(id: string): Promise<ImportJob> {
    const cached = this.snapshots.get(id);
    if (cached) return cached;
    const fromDb = await this.findById(id);
    if (!fromDb) throw new Error(`ImportJob ${id} not found`);
    this.snapshots.set(id, fromDb);
    return fromDb;
  }

  private cleanup(id: string): void {
    this.snapshots.delete(id);
    this.lastFlushAt.delete(id);
  }
}

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function nowDt64(): string {
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

function computeDurationMs(startedAt: string | null, finishedAt: string | null): number {
  if (!startedAt || !finishedAt) return 0;
  const start = new Date(startedAt.replace(' ', 'T') + 'Z').getTime();
  const end = new Date(finishedAt.replace(' ', 'T') + 'Z').getTime();
  return Math.max(0, end - start);
}

function domainToRow(job: ImportJob): ImportJobRow {
  return {
    id: job.id,
    source_type: job.sourceType,
    status: job.status,
    file_name: job.fileName,
    file_path: job.filePath,
    file_size_bytes: job.fileSizeBytes,
    file_hash: job.fileHash,
    params: JSON.stringify(job.params ?? {}),
    progress_current: job.progressCurrent,
    progress_total: job.progressTotal,
    progress_label: job.progressLabel,
    total_rows: job.totalRows,
    processed_rows: job.processedRows,
    skipped_rows: job.skippedRows,
    error_rows: job.errorRows,
    result: job.result ? JSON.stringify(job.result) : '',
    error_message: job.errorMessage,
    batch_id: job.batchId,
    tenant_id: job.tenantId,
    created_by: job.createdBy,
    created_at: job.createdAt,
    started_at: job.startedAt,
    finished_at: job.finishedAt,
    duration_ms: job.durationMs,
    updated_at: job.updatedAt,
  };
}

function rowToDomain(row: ImportJobRow): ImportJob {
  return {
    id: row.id,
    sourceType: row.source_type as ImportJobSourceType,
    status: row.status as ImportJobStatus,
    fileName: row.file_name,
    filePath: row.file_path,
    fileSizeBytes: Number(row.file_size_bytes),
    fileHash: row.file_hash,
    params: safeJsonParse(row.params),
    progressCurrent: Number(row.progress_current),
    progressTotal: Number(row.progress_total),
    progressLabel: row.progress_label,
    totalRows: Number(row.total_rows),
    processedRows: Number(row.processed_rows),
    skippedRows: Number(row.skipped_rows),
    errorRows: Number(row.error_rows),
    result: row.result ? safeJsonParse(row.result) : null,
    errorMessage: row.error_message,
    batchId: row.batch_id,
    tenantId: row.tenant_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: Number(row.duration_ms),
    updatedAt: row.updated_at,
  };
}

function safeJsonParse(s: string): Record<string, unknown> {
  if (!s) return {};
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
