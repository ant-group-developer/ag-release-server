import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { ClickHouseService } from '../../clickhouse/clickhouse.service';
import { ClickHouseMigrationService } from '../../clickhouse/clickhouse-migration.service';
import { SpotifyExportToolService } from './spotify-export-tool.service';
import { UpdateSpotifyExportSchedulerConfigDto } from '../dto/spotify-export-scheduler-config.dto';

export interface SpotifyExportSchedulerConfig {
  enabled: boolean;
  cron: string;
  force: boolean;
}

const CRON_JOB_NAME = 'spotify-export-auto-trigger';
const DEFAULT_ENABLED = false;
const DEFAULT_CRON = '0 3 * * *';
const DEFAULT_FORCE = false;

/**
 * Cron scheduler gọi sang ag-release-tool-export theo lịch cố định (mặc định 3AM),
 * để Box -> R2 upload xong trước khi spotify-r2-auto-sync chạy lúc 4AM.
 * Config-driven từ ClickHouse etl_config, toggle được qua API.
 */
@Injectable()
export class SpotifyExportSchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SpotifyExportSchedulerService.name);

  constructor(
    private readonly clickHouseService: ClickHouseService,
    private readonly clickHouseMigrationService: ClickHouseMigrationService,
    private readonly spotifyExportToolService: SpotifyExportToolService,
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onApplicationBootstrap() {
    this.initializeInBackground().catch((err) => {
      this.logger.error(`Failed to initialize Spotify export scheduler: ${err.message}`, err.stack);
    });
  }

  private async initializeInBackground() {
    await this.clickHouseMigrationService.waitForMigrations();
    try {
      const config = await this.getConfig();
      await this.rescheduleCron(config.cron);
    } catch (err) {
      this.logger.error(`Failed to initialize Spotify export scheduler: ${err.message}`, err.stack);
    }
  }

  async getConfig(): Promise<SpotifyExportSchedulerConfig> {
    const rows = await this.clickHouseService.query<{ key: string; value: string }>(
      `SELECT key, value FROM etl_config FINAL WHERE key IN (
        'spotify_export_scheduler_enabled',
        'spotify_export_scheduler_cron',
        'spotify_export_scheduler_force'
      )`,
    );

    const cfg: Record<string, string> = {};
    for (const r of rows) {
      cfg[r.key] = r.value;
    }

    return {
      enabled: cfg.spotify_export_scheduler_enabled !== undefined
        ? cfg.spotify_export_scheduler_enabled === 'true'
        : DEFAULT_ENABLED,
      cron: cfg.spotify_export_scheduler_cron || DEFAULT_CRON,
      force: cfg.spotify_export_scheduler_force !== undefined
        ? cfg.spotify_export_scheduler_force === 'true'
        : DEFAULT_FORCE,
    };
  }

  async setConfig(dto: UpdateSpotifyExportSchedulerConfigDto): Promise<SpotifyExportSchedulerConfig> {
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const rows: Array<Record<string, unknown>> = [];

    if (dto.enabled !== undefined) {
      rows.push({ key: 'spotify_export_scheduler_enabled', value: dto.enabled ? 'true' : 'false', updated_at: now });
    }
    if (dto.cron !== undefined) {
      rows.push({ key: 'spotify_export_scheduler_cron', value: dto.cron, updated_at: now });
    }
    if (dto.force !== undefined) {
      rows.push({ key: 'spotify_export_scheduler_force', value: dto.force ? 'true' : 'false', updated_at: now });
    }

    if (rows.length > 0) {
      await this.clickHouseService.insert('etl_config', rows);
    }

    return this.getConfig();
  }

  async rescheduleCron(cronExpr: string): Promise<void> {
    try {
      if (this.schedulerRegistry.getCronJobs().has(CRON_JOB_NAME)) {
        this.schedulerRegistry.deleteCronJob(CRON_JOB_NAME);
        this.logger.log(`Deleted existing cron job: ${CRON_JOB_NAME}`);
      }

      const job = new CronJob(
        cronExpr,
        () => {
          this.logger.log('Executing scheduled Spotify export trigger...');
          this.handleCron().catch((err) => {
            this.logger.error(`Scheduled Spotify export trigger failed: ${err.message}`, err.stack);
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
      this.logger.error(
        `Failed to reschedule cron job [${CRON_JOB_NAME}] with expression "${cronExpr}": ${err.message}`,
      );
    }
  }

  private async handleCron(): Promise<void> {
    const config = await this.getConfig();
    if (!config.enabled) {
      this.logger.debug('Spotify export scheduler skipped (disabled)');
      return;
    }
    try {
      const job = await this.spotifyExportToolService.triggerExport({ force: config.force });
      this.logger.log(`Scheduled export triggered (force=${config.force}), internal jobId=${job.id}`);
    } catch (err) {
      this.logger.error(`Scheduled Spotify export failed: ${err.message}`, err.stack);
    }
  }
}
