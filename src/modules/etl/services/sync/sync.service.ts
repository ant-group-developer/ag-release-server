import { Injectable, Logger } from '@nestjs/common';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { ClickHouseService, CLICKHOUSE_TABLES } from '../../../clickhouse';
import { FtpService } from '../ftp/ftp.service';
import { ImportService } from '../import/import.service';
import { ExchangeRateService } from '../exchange-rate/exchange-rate.service';
import { ExcludePatternService } from '../../../dsp-report/services/ftp-exclude-pattern.service';

export interface SyncPeriodResult {
  period: string;
  categories: Array<{
    category: string;
    folders: Array<{
      dsp_folder: string;
      status: 'done' | 'skipped' | 'error' | 'updated';
      rows: number;
      files: number;
      durationMs: number;
      error?: string;
      reason?: string;
    }>;
  }>;
  totalRows: number;
  totalFiles: number;
  durationMs: number;
}

export interface ImportHistoryRow {
  id: string;
  period: string;
  source_type: string;
  category: string;
  dsp_folder: string;
  status: string;
  rows_imported: string;
  files_processed: string;
  files_list: string[];
  duration_ms: string;
  error_message: string;
  batch_id: string;
  started_at: string;
  completed_at: string;
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);
  private readonly tempBaseDir = path.join(os.tmpdir(), 'etl-import');
  /** Cache: folder name (lowercase) → dsps_report UUID, cleared per syncPeriod call */
  private dspIdCache = new Map<string, string>();

  constructor(
    private readonly ftpService: FtpService,
    private readonly importService: ImportService,
    private readonly clickHouseService: ClickHouseService,
    @InjectRedis() private readonly redis: Redis,
    private readonly exchangeRateService: ExchangeRateService,
    private readonly excludePatternService: ExcludePatternService,
  ) { }

  // ── Tracking helpers ──────────────────────────────────

  private async upsertTracking(data: {
    period: string;
    source_type: string;
    category: string;
    dsp_folder: string;
    status: string;
    rows_imported?: number;
    files_processed?: number;
    files_list?: string[];
    duration_ms?: number;
    error_message?: string;
    batch_id?: string;
  }) {
    await this.clickHouseService.insert('etl_import_history', [
      {
        id: uuidv4(),
        period: data.period,
        source_type: data.source_type,
        category: data.category,
        dsp_folder: data.dsp_folder,
        status: data.status,
        rows_imported: data.rows_imported || 0,
        files_processed: data.files_processed || 0,
        files_list: data.files_list || [],
        duration_ms: data.duration_ms || 0,
        error_message: data.error_message || '',
        batch_id: data.batch_id || '',
        started_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
        completed_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
      },
    ]);
  }

  /**
   * Get import history for all periods, or filter by period.
   * Uses FINAL to deduplicate ReplacingMergeTree rows.
   */
  async getImportHistory(period?: string): Promise<ImportHistoryRow[]> {
    let where = '';
    const params: Record<string, unknown> = {};

    if (period) {
      where = `WHERE period = {period:String}`;
      params.period = period;
    }

    const sql = `
      SELECT *
      FROM etl_import_history FINAL
      ${where}
      ORDER BY period DESC, category, dsp_folder
    `;
    return this.clickHouseService.query<ImportHistoryRow>(sql, params);
  }

  /**
   * Get detailed import info for change detection.
   * Returns a Map of "period|category|dsp_folder" → { status, files_list }
   */
  private async getImportedDetails(): Promise<Map<string, { status: string; files_list: string[] }>> {
    const sql = `
      SELECT period, category, dsp_folder, status, files_list
      FROM etl_import_history FINAL
      WHERE status = 'done'
    `;
    const rows = await this.clickHouseService.query<{
      period: string;
      category: string;
      dsp_folder: string;
      status: string;
      files_list: string[];
    }>(sql);

    const map = new Map<string, { status: string; files_list: string[] }>();
    for (const r of rows) {
      map.set(`${r.period}|${r.category}|${r.dsp_folder}`, {
        status: r.status,
        files_list: r.files_list || [],
      });
    }
    return map;
  }

  /**
   * Delete fact data for a specific (period, category, dsp_folder) combination.
   * This allows precise re-import without affecting other folders.
   * Runs fact + cube deletions in parallel for speed.
   */
  private async deleteFolderData(period: string, category: string, dspFolder: string): Promise<void> {
    const periodStart = `${period.substring(0, 4)}-${period.substring(4, 6)}-01`;
    const dspName = dspFolder.includes('-')
      ? dspFolder.split('-').slice(1).join('-')
      : dspFolder;

    // Resolve UUID for this dspFolder from dsps_report (use cache to avoid repeated queries)
    let resolvedDspId = this.dspIdCache.get(dspFolder.toLowerCase()) ?? '';
    if (!resolvedDspId) {
      try {
        const rows = await this.clickHouseService.query<{ id_dsps_report: string }>(
          `SELECT id_dsps_report FROM ${CLICKHOUSE_TABLES.DSPS_REPORT} WHERE lower(dsp_name) = {folder: String} LIMIT 1`,
          { folder: dspFolder.toLowerCase() }
        );
        if (rows.length > 0) {
          resolvedDspId = rows[0].id_dsps_report;
          this.dspIdCache.set(dspFolder.toLowerCase(), resolvedDspId);
        }
      } catch (err) {
        this.logger.warn(`Failed to resolve dsp_id UUID for folder ${dspFolder}: ${err.message}`);
      }
    }

    // Build unique list of possible dsp_id values (legacy name, short name, UUID)
    const ids = new Set([dspFolder]);
    if (dspName) ids.add(dspName);
    if (resolvedDspId) ids.add(resolvedDspId);
    const dspIdsInSql = [...ids].map((id) => `'${id}'`).join(', ');

    const table = category === 'sales'
      ? CLICKHOUSE_TABLES.FACT_SALES_REPORT
      : CLICKHOUSE_TABLES.FACT_DSP_COMPREHENSIVE_REPORT;
    const dateCol = category === 'sales' ? 'reporting_period_start' : 'reporting_period';
    const catFilter = category === 'sales' ? ''
      : `AND source_category = '${category === 'illegitimate_activity' ? 'illegitimate' : category}' `;

    const dateRange = `>= '${periodStart}' AND ${dateCol} < addMonths(toDate('${periodStart}'), 1)`;

    try {
      // Run fact table + cube deletions in parallel (all are independent mutations)
      const deletePromises: Promise<unknown>[] = [
        this.clickHouseService.execute(
          `ALTER TABLE ${table} DELETE WHERE ${dateCol} ${dateRange} ${catFilter}AND dsp_id IN (${dspIdsInSql})`,
        ),
      ];

      if (category !== 'sales') {
        deletePromises.push(
          this.clickHouseService.execute(
            `ALTER TABLE music_analytics.trends_dsp_monthly_cube DELETE WHERE period ${dateRange.replace(dateCol, 'period')} AND dsp_id IN (${dspIdsInSql})`,
          ),
          this.clickHouseService.execute(
            `ALTER TABLE music_analytics.trends_dsp_daily_cube DELETE WHERE reporting_date ${dateRange.replace(dateCol, 'reporting_date')} AND dsp_id IN (${dspIdsInSql})`,
          ),
        );
      } else {
        deletePromises.push(
          this.clickHouseService.execute(
            `ALTER TABLE music_analytics.sales_dsp_monthly_cube_v2 DELETE WHERE period ${dateRange.replace(dateCol, 'period')} AND dsp_id IN (${dspIdsInSql})`,
          ),
        );
      }

      await Promise.all(deletePromises);
      this.logger.log(`  🗑️ Deleted old data for ${category}/${dspFolder} in ${period} (including cubes)`);
    } catch (err) {
      this.logger.warn(`  Failed to delete old data for ${category}/${dspFolder}: ${err.message}`);
    }
  }

  // ── Sync operations ───────────────────────────────────

  /**
   * Sync a single period from FTPS.
   *
   * Smart incremental sync:
   * 1. For each DSP folder, compare FTP file list vs previously imported files_list
   * 2. If file lists match → skip (no new data)
   * 3. If FTP has new files → delete old data + re-import all (prevents duplicates)
   * 4. New folders (never imported) → import normally
   */
  async syncPeriod(period: string, force = false): Promise<SyncPeriodResult> {
    const startTime = Date.now();
    const batchId = uuidv4();

    // Clear UUID lookup cache for this sync batch
    this.dspIdCache.clear();

    // Get detailed import history (includes files_list for change detection)
    const importedDetails = force ? new Map() : await this.getImportedDetails();

    this.logger.log(`Syncing period ${period} (force=${force}), batch ${batchId}`);

    // If force=true, drop entire partition (instant metadata-only op, ~0ms)
    // instead of ALTER TABLE DELETE (slow row-level mutation)
    if (force) {
      const partitionId = period; // YYYYMM matches toYYYYMM() partition key
      try {
        // All tables are partitioned by toYYYYMM(date_col),
        // so DROP PARTITION is an O(1) filesystem operation — no row scanning needed.
        const allTables = [
          CLICKHOUSE_TABLES.FACT_DSP_COMPREHENSIVE_REPORT,
          CLICKHOUSE_TABLES.FACT_SALES_REPORT,
          CLICKHOUSE_TABLES.TRENDS_DSP_MONTHLY,
          CLICKHOUSE_TABLES.SALES_DSP_MONTHLY,
          CLICKHOUSE_TABLES.TRENDS_DSP_DAILY_CUBE,
          CLICKHOUSE_TABLES.TRENDS_ISRC_DAILY_CUBE,
          CLICKHOUSE_TABLES.SALES_TER_MONTHLY,
          CLICKHOUSE_TABLES.TRENDS_TER_MONTHLY,
        ];

        await Promise.all(
          allTables.map((table) =>
            this.clickHouseService.execute(
              `ALTER TABLE music_analytics.${table} DROP PARTITION '${partitionId}'`,
            ).catch((err) => {
              // Partition may not exist — that's fine, skip silently
              this.logger.debug(`DROP PARTITION ${partitionId} on ${table}: ${err.message}`);
            }),
          ),
        );

        this.logger.log(`Dropped partition ${partitionId} from all tables (including cubes) before re-import`);
      } catch (err) {
        this.logger.warn(`Failed to drop partition for ${period}: ${err.message}`);
      }
    }

    const result: SyncPeriodResult = {
      period,
      categories: [],
      totalRows: 0,
      totalFiles: 0,
      durationMs: 0,
    };

    for (const category of ['trends', 'usage', 'sales', 'illegitimate_activity'] as const) {
      const rawFolders = await this.ftpService.listDspFolders(category, period);

      // Lọc folder bị exclude theo config
      const dspFolders: string[] = [];
      for (const f of rawFolders) {
        if (await this.excludePatternService.shouldExclude(f, 'folder')) {
          this.logger.log(`  ⛔ [EXCLUDED] Skip folder ${category}/${f} (matched exclude pattern)`);
        } else {
          dspFolders.push(f);
        }
      }

      if (dspFolders.length === 0) {
        this.logger.log(`  No ${category}/${period} on FTPS`);
        continue;
      }

      const categoryResult: SyncPeriodResult['categories'][0] = {
        category,
        folders: [],
      };

      for (const dspFolder of dspFolders) {
        const key = `${period}|${category}|${dspFolder}`;
        const existing = importedDetails.get(key);

        // ── Change detection: compare file lists ──
        if (existing && existing.status === 'done' && !force) {
          // List files on FTP without downloading
          const remoteFiles = await this.ftpService.listRemoteFiles(category, period, dspFolder);
          const previousFiles = (existing.files_list || []).sort();

          // Compare: if identical → skip
          const filesMatch =
            remoteFiles.length === previousFiles.length &&
            remoteFiles.every((f, i) => f === previousFiles[i]);

          if (filesMatch) {
            this.logger.log(`  ✅ ${category}/${dspFolder} — ${remoteFiles.length} files unchanged, skip`);
            categoryResult.folders.push({
              dsp_folder: dspFolder,
              status: 'skipped',
              rows: 0,
              files: 0,
              durationMs: 0,
              reason: 'files unchanged',
            });
            continue;
          }

          // Files differ → need re-sync
          const newFiles = remoteFiles.filter((f) => !previousFiles.includes(f));
          this.logger.log(
            `  🔄 ${category}/${dspFolder} — ${newFiles.length} new files detected ` +
            `(FTP: ${remoteFiles.length}, imported: ${previousFiles.length}). Re-syncing...`,
          );

          // Delete old data for this specific folder before re-import
          await this.deleteFolderData(period, category, dspFolder);
        }

        // ── Download + import ──
        const folderStart = Date.now();
        const isUpdate = existing && existing.status === 'done';
        try {
          // Track: downloading
          await this.upsertTracking({
            period,
            source_type: 'ftp',
            category,
            dsp_folder: dspFolder,
            status: 'downloading',
            batch_id: batchId,
          });

          // Download from FTPS
          const { localPath, fileCount } = await this.ftpService.downloadDspFolder(
            period,
            category,
            dspFolder,
            this.tempBaseDir,
          );

          // Track: parsing
          await this.upsertTracking({
            period,
            source_type: 'ftp',
            category,
            dsp_folder: dspFolder,
            status: 'parsing',
            batch_id: batchId,
          });

          // Parse using existing import service
          const dspResult = await this.importService.importDspFolder(localPath, dspFolder, batchId, category);

          // If no parser found, log and skip
          if (!dspResult) {
            this.logger.warn(`  ⚠️ [UNKNOWN DSP] No parser for ${category}/${dspFolder} — skipping`);
            categoryResult.folders.push({
              dsp_folder: dspFolder,
              status: 'skipped',
              rows: 0,
              files: 0,
              durationMs: Date.now() - folderStart,
              reason: `no parser for ${category}`,
            });
            this.ftpService.cleanupTemp(localPath);
            continue;
          }

          const rows = dspResult.rows || 0;
          const files = dspResult.files || 0;
          const fileNames = dspResult.fileNames || [];
          const durationMs = Date.now() - folderStart;

          // Track: done (with updated files_list for future change detection)
          await this.upsertTracking({
            period,
            source_type: 'ftp',
            category,
            dsp_folder: dspFolder,
            status: 'done',
            rows_imported: rows,
            files_processed: files,
            files_list: fileNames,
            duration_ms: durationMs,
            batch_id: batchId,
          });

          // Cleanup temp
          this.ftpService.cleanupTemp(localPath);

          categoryResult.folders.push({
            dsp_folder: dspFolder,
            status: isUpdate ? 'updated' : 'done',
            rows,
            files,
            durationMs,
            reason: isUpdate ? 'new files detected' : undefined,
          });

          result.totalRows += rows;
          result.totalFiles += files;

          this.logger.log(
            `  ${isUpdate ? '🔄' : '✅'} ${category}/${dspFolder}: ${rows} rows, ${files} files (${durationMs}ms)` +
            (isUpdate ? ' [UPDATED]' : ''),
          );
        } catch (err) {
          const durationMs = Date.now() - folderStart;

          await this.upsertTracking({
            period,
            source_type: 'ftp',
            category,
            dsp_folder: dspFolder,
            status: 'error',
            error_message: err.message,
            duration_ms: durationMs,
            batch_id: batchId,
          });

          categoryResult.folders.push({
            dsp_folder: dspFolder,
            status: 'error',
            rows: 0,
            files: 0,
            durationMs,
            error: err.message,
          });

          this.logger.error(`  ❌ ${category}/${dspFolder}: ${err.message}`);
        }
      }

      result.categories.push(categoryResult);
    }

    result.durationMs = Date.now() - startTime;
    this.logger.log(
      `Period ${period} sync done: ${result.totalRows} rows, ${result.totalFiles} files (${result.durationMs}ms)`,
    );

    // Invalidate analytics cache after successful import
    // Sync rates and rebuild cubes if data was imported
    if (result.totalRows > 0) {
      try {
        this.logger.log('Import detected new rows. Syncing missing exchange rates and rebuilding cubes...');
        await this.exchangeRateService.backfillMissingRates();
      } catch (err) {
        this.logger.error(`Failed to sync rates and rebuild cubes: ${err.message}`, err.stack);
      }

      try {
        const keys = await this.redis.keys('analytics:*');
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
        this.logger.log(`Cache invalidated: ${keys.length} keys matching 'analytics:*'`);
      } catch (err) {
        this.logger.warn(`Cache invalidation failed: ${err.message}`);
      }
    }

    return result;
  }

  /**
   * Sync ALL periods from FTPS.
   * Each period is checked for new files — no data is missed even for "done" periods.
   */
  async syncAll(force = false): Promise<SyncPeriodResult[]> {
    const periods = await this.ftpService.listPeriods();
    const results: SyncPeriodResult[] = [];

    for (const period of periods) {
      const result = await this.syncPeriod(period, force);
      results.push(result);
    }

    return results;
  }

  /**
   * Get sync status: which periods/folders are imported vs pending.
   */
  async getStatus(): Promise<any> {
    const periods = await this.ftpService.listPeriods();
    const importedDetails = await this.getImportedDetails();
    const history = await this.getImportHistory();

    // Build history lookup
    const historyMap = new Map<string, ImportHistoryRow>();
    for (const row of history) {
      historyMap.set(`${row.period}|${row.category}|${row.dsp_folder}`, row);
    }

    const result: any[] = [];

    for (const period of periods) {
      const periodData: any = { period, trends: null, usage: null };

      for (const category of ['trends', 'usage'] as const) {
        const folders = await this.ftpService.listDspFolders(category, period);

        if (folders.length === 0) continue;

        const folderStatuses = folders.map((f) => {
          const key = `${period}|${category}|${f}`;
          const hist = historyMap.get(key);
          return {
            name: f,
            status: hist?.status || 'pending',
            rows: hist ? Number(hist.rows_imported) : 0,
            files_imported: hist ? Number(hist.files_processed) : 0,
            imported_at: hist?.completed_at || null,
          };
        });

        const imported = folderStatuses.filter((f) => f.status === 'done').length;

        periodData[category] = {
          total: folders.length,
          imported,
          pending: folders.length - imported,
          folders: folderStatuses,
        };
      }

      result.push(periodData);
    }

    return { periods: result };
  }

  // ── Config management ─────────────────────────────────

  async getSyncConfig(): Promise<{ mode: string; cron: string }> {
    const sql = `SELECT key, value FROM etl_config FINAL WHERE key IN ('sync_mode', 'sync_cron')`;
    const rows = await this.clickHouseService.query<{ key: string; value: string }>(sql);

    const config: Record<string, string> = {};
    for (const r of rows) {
      config[r.key] = r.value;
    }

    return {
      mode: config.sync_mode || process.env.FTP_SYNC_MODE || 'manual',
      cron: config.sync_cron || process.env.FTP_SYNC_CRON || '0 2 * * *',
    };
  }

  async setSyncConfig(mode: string, cron?: string): Promise<{ mode: string; cron: string }> {
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

    const rows: Array<Record<string, unknown>> = [
      { key: 'sync_mode', value: mode, updated_at: now },
    ];

    if (cron) {
      rows.push({ key: 'sync_cron', value: cron, updated_at: now });
    }

    await this.clickHouseService.insert('etl_config', rows);
    this.logger.log(`Sync config updated: mode=${mode}, cron=${cron || '(unchanged)'}`);

    return this.getSyncConfig();
  }
}
