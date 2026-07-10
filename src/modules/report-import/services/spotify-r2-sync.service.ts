import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { pipeline } from 'stream/promises';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const AdmZip = require('adm-zip');
import { ClickHouseService } from '../../clickhouse/clickhouse.service';
import { ClickHouseMigrationService } from '../../clickhouse/clickhouse-migration.service';
import { BucketR2Service } from '../../bucket2/services/bucket-r2.service';
import { ReportDetectorService } from './report-detector.service';
import { ReportImportQueueService } from './report-import-queue.service';
import { ImportJobsService } from '../../etl/services/import-jobs/import-jobs.service';
import { ImportJob, ImportJobSourceType } from '../../etl/interfaces';
import { UpdateSpotifyR2SyncConfigDto } from '../dto/spotify-r2-sync-config.dto';

export interface SpotifyR2SyncConfig {
  enabled: boolean;
  cron: string;
  prefix: string;
  retentionDays: number;
}

export interface SpotifyR2SyncResult {
  zipsFound: number;
  zipsImported: number;
  zipsSkipped: number;
}

const CRON_JOB_NAME = 'spotify-r2-auto-sync';
const DEFAULT_ENABLED = true;
const DEFAULT_CRON = '0 4 * * *';
const DEFAULT_PREFIX = 'spotify-reports/';
const DEFAULT_RETENTION_DAYS = 30;

@Injectable()
export class SpotifyR2SyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SpotifyR2SyncService.name);
  private isRunning = false;

  constructor(
    private readonly clickHouseService: ClickHouseService,
    private readonly clickHouseMigrationService: ClickHouseMigrationService,
    private readonly r2Service: BucketR2Service,
    private readonly detectorService: ReportDetectorService,
    private readonly queueService: ReportImportQueueService,
    private readonly importJobsService: ImportJobsService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onApplicationBootstrap() {
    if (process.env.APP_ROLE !== 'worker') {
      this.logger.debug('Skipping Spotify R2 sync cron (not worker role)');
      return;
    }
    this.initializeInBackground().catch((err) => {
      this.logger.error(`Failed to initialize Spotify R2 sync cron: ${err.message}`, err.stack);
    });
  }

  private async initializeInBackground() {
    await this.clickHouseMigrationService.waitForMigrations();
    try {
      const config = await this.getConfig();
      await this.rescheduleCron(config.cron);
    } catch (err) {
      this.logger.error(`Failed to initialize Spotify R2 sync cron: ${err.message}`, err.stack);
    }
  }

  // ── Config (etl_config key-value, giống SyncService.getSyncConfig/setSyncConfig) ──

  async getConfig(): Promise<SpotifyR2SyncConfig> {
    const rows = await this.clickHouseService.query<{ key: string; value: string }>(
      `SELECT key, value FROM etl_config FINAL WHERE key IN (
        'spotify_r2_sync_enabled',
        'spotify_r2_sync_cron',
        'spotify_r2_sync_prefix',
        'spotify_r2_sync_retention_days'
      )`,
    );

    const cfg: Record<string, string> = {};
    for (const r of rows) {
      cfg[r.key] = r.value;
    }

    return {
      enabled: cfg.spotify_r2_sync_enabled !== undefined
        ? cfg.spotify_r2_sync_enabled === 'true'
        : DEFAULT_ENABLED,
      cron: cfg.spotify_r2_sync_cron || DEFAULT_CRON,
      prefix: cfg.spotify_r2_sync_prefix || DEFAULT_PREFIX,
      retentionDays: cfg.spotify_r2_sync_retention_days !== undefined
        ? Number(cfg.spotify_r2_sync_retention_days)
        : DEFAULT_RETENTION_DAYS,
    };
  }

  async setConfig(dto: UpdateSpotifyR2SyncConfigDto): Promise<SpotifyR2SyncConfig> {
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const rows: Array<Record<string, unknown>> = [];

    if (dto.enabled !== undefined) {
      rows.push({ key: 'spotify_r2_sync_enabled', value: dto.enabled ? 'true' : 'false', updated_at: now });
    }
    if (dto.cron !== undefined) {
      rows.push({ key: 'spotify_r2_sync_cron', value: dto.cron, updated_at: now });
    }
    if (dto.prefix !== undefined) {
      rows.push({ key: 'spotify_r2_sync_prefix', value: dto.prefix, updated_at: now });
    }
    if (dto.retentionDays !== undefined) {
      rows.push({ key: 'spotify_r2_sync_retention_days', value: String(dto.retentionDays), updated_at: now });
    }

    if (rows.length > 0) {
      await this.clickHouseService.insert('etl_config', rows);
    }

    return this.getConfig();
  }

  // ── Cron registration (dynamic, giống SchedulerService.rescheduleAutoSync) ──

  async rescheduleCron(cronExpr: string): Promise<void> {
    try {
      if (this.schedulerRegistry.getCronJobs().has(CRON_JOB_NAME)) {
        this.schedulerRegistry.deleteCronJob(CRON_JOB_NAME);
        this.logger.log(`Deleted existing cron job: ${CRON_JOB_NAME}`);
      }

      const job = new CronJob(
        cronExpr,
        () => {
          this.logger.log('Executing scheduled Spotify R2 sync...');
          this.handleCron().catch((err) => {
            this.logger.error(`Scheduled Spotify R2 sync failed: ${err.message}`, err.stack);
          });
        },
        null,
        false,
        'Asia/Ho_Chi_Minh',
      );

      this.schedulerRegistry.addCronJob(CRON_JOB_NAME, job);
      job.start();
      this.logger.log(`Rescheduled cron job [${CRON_JOB_NAME}] to: ${cronExpr}`);
    } catch (err) {
      this.logger.error(`Failed to reschedule cron job [${CRON_JOB_NAME}] with expression "${cronExpr}": ${err.message}`);
    }
  }

  async handleCron(): Promise<void> {
    const config = await this.getConfig();
    if (!config.enabled) {
      this.logger.debug('Spotify R2 sync skipped (disabled)');
      return;
    }
    await this.syncOnce(config.prefix);
    await this.cleanupProcessedZips(config.prefix, config.retentionDays);
  }

  /**
   * Delete zips under {prefix}processed/ older than retentionDays.
   * Runs as part of the daily cron only (not on manual "sync now" triggers)
   * to avoid accidental deletion while debugging/re-testing a specific zip.
   */
  async cleanupProcessedZips(prefix: string, retentionDays: number): Promise<{ deleted: number }> {
    if (!retentionDays || retentionDays <= 0) {
      return { deleted: 0 };
    }

    const normalizedPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;
    const processedPrefix = `${normalizedPrefix}processed/`;
    const bucketName = this.r2Service.getBucketName({ isPublic: false });
    const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

    const files = await this.r2Service.getFilesByPrefix({ prefix: processedPrefix, isPublic: false });
    const expired = files.filter((f) => {
      const lastModified = f.file.LastModified ? new Date(f.file.LastModified).getTime() : 0;
      return lastModified > 0 && lastModified < cutoffMs;
    });

    if (expired.length === 0) {
      return { deleted: 0 };
    }

    this.logger.log(
      `Cleaning up ${expired.length} zip(s) older than ${retentionDays}d under ${processedPrefix}`,
    );

    let deleted = 0;
    for (const f of expired) {
      try {
        await this.r2Service.deletePrivate(f.key);
        deleted++;
      } catch (err) {
        this.logger.error(`Failed to delete expired zip ${f.key}: ${err.message}`);
      }
    }

    this.logger.log(`Deleted ${deleted}/${expired.length} expired zip(s) from ${processedPrefix}`);
    return { deleted };
  }

  // ── Sync logic ──

  /**
   * Trigger a manual sync run in the background and return immediately with a jobId.
   * Avoids HTTP timeout when there are many/large zips to process.
   * Poll GET /report-import/jobs/:jobId/status (or /etl/jobs/:jobId) with the returned jobId.
   */
  async triggerManualSync(prefix?: string): Promise<ImportJob> {
    const resolvedPrefix = prefix ?? (await this.getConfig()).prefix;
    const job = await this.importJobsService.create({
      sourceType: ImportJobSourceType.SPOTIFY_R2_SYNC,
      params: { trigger: 'manual-api', prefix: resolvedPrefix },
    });

    void this.runManualSync(job.id, resolvedPrefix);

    return job;
  }

  private async runManualSync(jobId: string, prefix: string): Promise<void> {
    try {
      await this.importJobsService.markProcessing(jobId);
      const result = await this.syncOnce(prefix, jobId);
      await this.importJobsService.markCompleted(jobId, result as unknown as Record<string, unknown>);
    } catch (err) {
      this.logger.error(`Manual Spotify R2 sync job ${jobId} failed: ${err.message}`, err.stack);
      await this.importJobsService.markFailed(jobId, err);
    }
  }

  async syncOnce(prefix?: string, jobId?: string): Promise<SpotifyR2SyncResult> {
    if (this.isRunning) {
      this.logger.warn('Spotify R2 sync already in progress, skip this run.');
      return { zipsFound: 0, zipsImported: 0, zipsSkipped: 0 };
    }

    this.isRunning = true;
    try {
      const resolvedPrefix = prefix ?? (await this.getConfig()).prefix;
      const files = await this.r2Service.getFilesByPrefix({ prefix: resolvedPrefix, isPublic: false });
      const zips = files.filter((f) => f.key.toLowerCase().endsWith('.zip') && !f.key.includes('/processed/'));

      this.logger.log(`Found ${zips.length} zip(s) under prefix "${resolvedPrefix}"`);

      if (jobId) {
        await this.importJobsService.updateProgress(
          jobId,
          { progressTotal: zips.length, progressCurrent: 0, progressLabel: `Found ${zips.length} zip(s)` },
          true,
        );
      }

      let zipsImported = 0;
      let zipsSkipped = 0;

      for (let i = 0; i < zips.length; i++) {
        const matched = await this.processZip(zips[i].key, resolvedPrefix);
        if (matched) {
          zipsImported++;
        } else {
          zipsSkipped++;
        }

        if (jobId) {
          await this.importJobsService.updateProgress(
            jobId,
            { progressCurrent: i + 1, progressLabel: `Processed ${i + 1}/${zips.length} zip(s)` },
            true,
          );
        }
      }

      return { zipsFound: zips.length, zipsImported, zipsSkipped };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Returns true if at least 1 file inside the zip matched a known report config
   * and was queued for import.
   */
  private async processZip(zipKey: string, prefix: string): Promise<boolean> {
    const bucketName = this.r2Service.getBucketName({ isPublic: false });
    const runId = uuidv4();
    const tempDir = path.join(os.tmpdir(), 'spotify-r2-sync', runId);
    const localZipPath = path.join(tempDir, path.basename(zipKey));

    let matchedAny = false;

    try {
      await fs.promises.mkdir(tempDir, { recursive: true });

      this.logger.log(`Downloading ${zipKey} from R2...`);
      const stream = await this.r2Service.getObjectStream({ bucketName, key: zipKey });
      const writeStream = fs.createWriteStream(localZipPath);
      await pipeline(stream, writeStream);

      const extractDir = path.join(tempDir, 'extracted');
      const zip = new AdmZip(localZipPath);
      zip.extractAllTo(extractDir, true);

      const extractedFiles = this.findExtractedFiles(extractDir);
      const jobId = uuidv4();
      const matched: Array<{
        path: string;
        r2Key: string;
        size: number;
        sourceCode: string;
        reportType: string;
        parserCode: string;
        defaultCurrency?: string;
        defaultMember?: string;
      }> = [];

      for (const extracted of extractedFiles) {
        const filename = path.basename(extracted);
        const config = await this.detectorService.detectConfig(extracted);
        if (!config) {
          this.logger.log(`Skip unrecognized file: ${filename}`);
          continue;
        }

        const stat = await fs.promises.stat(extracted);
        const r2Key = `reports/${jobId}/${filename}`;
        await this.r2Service.uploadFileFromPath({
          key: r2Key,
          filePath: extracted,
          contentType: 'text/csv',
          isPublic: false,
        });

        matched.push({
          path: filename,
          r2Key,
          size: stat.size,
          sourceCode: config.sourceCode,
          reportType: config.reportType,
          parserCode: config.parserCode,
          defaultCurrency: config.defaultCurrency,
          defaultMember: config.defaultMember,
        });
      }

      if (matched.length > 0) {
        const fileNames = matched.map((m) => m.path);
        const totalSizeBytes = matched.reduce((acc, f) => acc + f.size, 0);

        const job = await this.importJobsService.create({
          sourceType: ImportJobSourceType.REPORT_UPLOAD,
          params: { files: matched, trigger: 'spotify-r2-auto-sync', sourceZipKey: zipKey },
          fileName: fileNames.join(', '),
          fileSizeBytes: totalSizeBytes,
          progressTotal: matched.length,
        });

        await this.queueService.pushJob(job.id);
        await this.importJobsService.markQueued(job.id);
        matchedAny = true;

        this.logger.log(`Queued job ${job.id} for zip ${zipKey} with ${matched.length} matched file(s)`);
      } else {
        this.logger.log(`No recognized file inside zip ${zipKey}, nothing to import.`);
      }

      await this.moveZipToProcessed(bucketName, zipKey, prefix);
      return matchedAny;
    } catch (err) {
      this.logger.error(`Failed to process zip ${zipKey}: ${err.message}`, err.stack);
      return false;
    } finally {
      await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  private async moveZipToProcessed(bucketName: string, zipKey: string, prefix: string): Promise<void> {
    const filename = path.basename(zipKey);
    const normalizedPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;
    const toKey = `${normalizedPrefix}processed/${filename}`;
    try {
      await this.r2Service.moveObject({ bucketName, fromKey: zipKey, toKey });
      this.logger.log(`Moved ${zipKey} -> ${toKey}`);
    } catch (err) {
      this.logger.error(`Failed to move zip ${zipKey} to processed/: ${err.message}`);
    }
  }

  private findExtractedFiles(dir: string): string[] {
    const results: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...this.findExtractedFiles(fullPath));
      } else {
        results.push(fullPath);
      }
    }
    return results;
  }
}
