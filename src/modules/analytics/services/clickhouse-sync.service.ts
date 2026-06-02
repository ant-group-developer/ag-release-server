import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { Client } from 'pg';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { ClickHouseService } from 'src/modules/clickhouse/clickhouse.service';
import { CLICKHOUSE_TABLES } from 'src/modules/clickhouse/clickhouse.constants';
import { DspSeedingService } from 'src/modules/dsp/services/dsp-seeding.service';

// So ban ghi xu ly moi lan quet outbox
const OUTBOX_BATCH_SIZE = 200;

// So ban ghi insert moi batch khi initial sync
const INITIAL_SYNC_BATCH_SIZE = 2000;

interface OutboxJob {
  id: number;
  entity_name: string;
  entity_id: string;
  action: string;
}

interface TrackSyncRow {
  [key: string]: any;
  isrc: string;
  tenant_id: string;
  release_id: string;
  label_id: string;
  artist_ids: string[];
  is_deleted: number;
  updated_at: string;
}

interface DspSyncRow {
  [key: string]: any;
  pg_uuid: string;
  dsp_code: string;
  dsp_name: string;
  dsp_ci_code: string;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class ClickHouseSyncService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ClickHouseSyncService.name);
  private pgListenClient: Client | null = null;
  private isProcessing = false;

  constructor(
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
    private readonly clickHouseService: ClickHouseService,
    private readonly configService: ConfigService,
    private readonly seedingService: DspSeedingService,
  ) {}

  // ======================================================
  // LIFECYCLE: Khoi dong
  // ======================================================

  async onModuleInit() {
    this.logger.log('Initializing ClickHouse sync service...');

    // 1. Sync dsps from PostgreSQL to ClickHouse pg_dsps_sync on startup
    await this.syncDspsOnStartup();

    // 2. Dong bo du lieu lich su (neu can)
    await this.runInitialSyncIfNeeded();

    // 3. Quet bu outbox (truong hop server chet truoc do)
    await this.processOutboxQueue();

    // 4. Bat dau lang nghe thoi gian thuc
    await this.startListening();
  }

  private async syncDspsOnStartup() {
    try {
      // Check if pg_dsps_sync has any records
      const result = await this.clickHouseService.query<{ c: number }>(
        `SELECT count() as c FROM ${CLICKHOUSE_TABLES.PG_DSPS_SYNC}`
      );
      const count = result[0]?.c ?? 0;

      if (count === 0) {
        this.logger.log('pg_dsps_sync is empty, seeding from PostgreSQL dsps...');
        await this.seedingService.seedFromDsps();
        this.logger.log('DSP seeding completed');
      } else {
        this.logger.log(`pg_dsps_sync has ${count} records, skipping seeding`);
      }
    } catch (err: any) {
      this.logger.error(`DSP seeding on startup failed: ${err.message}`);
    }
  }

  // ======================================================
  // INITIAL SYNC: Tu dong dong bo du lieu cu khi start
  // ======================================================

  private async runInitialSyncIfNeeded() {
    try {
      // Dem so ban ghi hien co tren ClickHouse
      const countResult = await this.clickHouseService.query<{ c: string }>(
        `SELECT count() AS c FROM ${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} WHERE is_deleted = 0`,
      );
      const chCount = Number(countResult[0]?.c ?? 0);

      // Dem so ISRC hop le tren Postgres
      const pgCountResult = await this.entityManager.query(
        `SELECT COUNT(DISTINCT t.isrc) AS c
         FROM tracks t
         INNER JOIN releases r ON r.id = t.release_id
         WHERE t.isrc IS NOT NULL AND t.isrc != ''`,
      );
      const pgCount = Number(pgCountResult[0]?.c ?? 0);

      this.logger.log(
        `Initial sync check: ClickHouse=${chCount} rows, Postgres=${pgCount} ISRCs`,
      );

      // Neu ClickHouse trong hoac thieu du lieu dang ke (>10% chenh lech)
      if (chCount === 0 || chCount < pgCount * 0.9) {
        this.logger.log(
          `Starting full initial sync from Postgres to ClickHouse (${pgCount} ISRCs)...`,
        );
        await this.performFullSync();
        this.logger.log('Full initial sync completed successfully.');
      } else {
        this.logger.log(
          'ClickHouse data is up to date, skipping initial sync.',
        );
      }
    } catch (err: any) {
      this.logger.error(`Initial sync check failed: ${err.message}`);
      // Khong throw - cho phep app tiep tuc chay du sync that bai
    }
  }

  private async performFullSync() {
    let offset = 0;
    let totalSynced = 0;

    while (true) {
      // Lay tung cum tu Postgres de tranh qua tai RAM
      const rows = await this.entityManager.query(
        `SELECT DISTINCT ON (t.isrc)
           t.isrc AS isrc,
           r.tenant_id AS tenant_id,
           r.id AS release_id,
           COALESCE(r.label_id, '') AS label_id,
           COALESCE(
             (
               SELECT array_to_string(array_agg(artist_id), ',')
               FROM track_artist
               WHERE track_id = t.id
             ),
             ''
           ) AS artist_ids
         FROM tracks t
         INNER JOIN releases r ON r.id = t.release_id
         WHERE t.isrc IS NOT NULL AND t.isrc != ''
         ORDER BY t.isrc
         LIMIT $1 OFFSET $2`,
        [INITIAL_SYNC_BATCH_SIZE, offset],
      );

      if (rows.length === 0) break;

      const chData: TrackSyncRow[] = rows.map((row: any) => ({
        isrc: row.isrc,
        tenant_id: row.tenant_id ?? '',
        release_id: row.release_id ?? '',
        label_id: row.label_id ?? '',
        artist_ids: row.artist_ids ? row.artist_ids.split(',') : [],
        is_deleted: 0,
        updated_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      }));

      await this.clickHouseService.insert(
        CLICKHOUSE_TABLES.PG_TRACKS_SYNC,
        chData,
      );

      totalSynced += rows.length;
      offset += INITIAL_SYNC_BATCH_SIZE;

      this.logger.log(`Initial sync progress: ${totalSynced} ISRCs synced`);
    }
  }

  // ======================================================
  // LISTEN/NOTIFY: Lang nghe thoi gian thuc
  // ======================================================

  private async startListening() {
    try {
      this.pgListenClient = new Client({
        host: this.configService.get<string>('DB_HOST'),
        port: this.configService.get<number>('DB_PORT'),
        user: this.configService.get<string>('DB_USERNAME'),
        password: this.configService.get<string>('DB_PASSWORD'),
        database: this.configService.get<string>('DB_DATABASE'),
      });

      await this.pgListenClient.connect();
      await this.pgListenClient.query('LISTEN clickhouse_sync_channel');
      this.logger.log(
        'LISTEN connection established on channel [clickhouse_sync_channel]'
      );

      this.pgListenClient.on('notification', async () => {
        this.logger.debug('Received sync notification from Postgres');
        await this.processOutboxQueue();
      });

      this.pgListenClient.on('error', (err: any) => {
        this.logger.error(
          `LISTEN connection error: ${err.message}. Reconnecting in 5s...`
        );
        this.scheduleReconnect();
      });
    } catch (err: any) {
      this.logger.error(
        `Failed to start LISTEN connection: ${err.message}. Reconnecting in 10s...`
      );
      this.scheduleReconnect(10000);
    }
  }

  private scheduleReconnect(delayMs = 5000) {
    setTimeout(async () => {
      try {
        if (this.pgListenClient) {
          await this.pgListenClient.end().catch(() => {});
          this.pgListenClient = null;
        }
        await this.startListening();
      } catch (err: any) {
        this.logger.error(`Reconnect failed: ${err.message}`);
        this.scheduleReconnect(delayMs * 2); // Exponential backoff
      }
    }, delayMs);
  }

  // ======================================================
  // OUTBOX PROCESSOR: Xu ly hang doi dong bo
  // ======================================================

  private async processOutboxQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (true) {
        const jobs: OutboxJob[] = await this.entityManager.query(
          `SELECT id, entity_name, entity_id, action
           FROM clickhouse_sync_outbox
           WHERE processed = false
           ORDER BY created_at ASC
           LIMIT $1`,
          [OUTBOX_BATCH_SIZE]
        );

        if (jobs.length === 0) break;

        this.logger.log(`Processing ${jobs.length} sync jobs from outbox...`);

        try {
          await this.syncJobsToClickHouse(jobs);

          // Danh dau hoan tat
          const jobIds = jobs.map((j) => j.id);
          await this.entityManager.query(
            `UPDATE clickhouse_sync_outbox
             SET processed = true, processed_at = NOW(), error_message = NULL
             WHERE id = ANY($1)`,
            [jobIds]
          );

          this.logger.log(`Synced ${jobs.length} jobs to ClickHouse successfully.`);
        } catch (err: any) {
          // Ghi nhan loi nhung KHONG cap nhat processed → se retry lan sau
          this.logger.error(`Sync batch failed: ${err.message}`);
          const jobIds = jobs.map((j) => j.id);
          await this.entityManager.query(
            `UPDATE clickhouse_sync_outbox
             SET error_message = $1
             WHERE id = ANY($2) AND processed = false`,
            [err.message.substring(0, 500), jobIds]
          );
          break; // Dung lai, doi notification tiep theo de retry
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async syncJobsToClickHouse(jobs: OutboxJob[]) {
    // Phan loai jobs theo entity va action
    const trackUpsertIds = jobs
      .filter((j) => j.entity_name === 'tracks' && j.action !== 'DELETE')
      .map((j) => j.entity_id);

    const releaseUpsertIds = jobs
      .filter((j) => j.entity_name === 'releases' && j.action !== 'DELETE')
      .map((j) => j.entity_id);

    const dspUpsertIds = jobs
      .filter((j) => j.entity_name === 'dsps' && j.action !== 'DELETE')
      .map((j) => j.entity_id);

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    // 1. Xu ly INSERT/UPDATE cho tracks
    if (trackUpsertIds.length > 0) {
      const rows = await this.entityManager.query(
        `SELECT DISTINCT ON (t.isrc)
           t.isrc AS isrc,
           r.tenant_id AS tenant_id,
           r.id AS release_id,
           COALESCE(r.label_id, '') AS label_id,
           COALESCE(
             (
               SELECT array_to_string(array_agg(artist_id), ',')
               FROM track_artist
               WHERE track_id = t.id
             ),
             ''
           ) AS artist_ids
         FROM tracks t
         INNER JOIN releases r ON r.id = t.release_id
         WHERE t.id = ANY($1)
           AND t.isrc IS NOT NULL AND t.isrc != ''
         ORDER BY t.isrc`,
        [trackUpsertIds]
      );

      if (rows.length > 0) {
        const chData: TrackSyncRow[] = rows.map((row: any) => ({
          isrc: row.isrc,
          tenant_id: row.tenant_id ?? '',
          release_id: row.release_id ?? '',
          label_id: row.label_id ?? '',
          artist_ids: row.artist_ids ? row.artist_ids.split(',') : [],
          is_deleted: 0,
          updated_at: now,
        }));
        await this.clickHouseService.insert(
          CLICKHOUSE_TABLES.PG_TRACKS_SYNC,
          chData
        );
      }
    }

    // 2. Xu ly INSERT/UPDATE cho releases (cap nhat tat ca tracks trong release do)
    if (releaseUpsertIds.length > 0) {
      const rows = await this.entityManager.query(
        `SELECT DISTINCT ON (t.isrc)
           t.isrc AS isrc,
           r.tenant_id AS tenant_id,
           r.id AS release_id,
           COALESCE(r.label_id, '') AS label_id,
           COALESCE(
             (
               SELECT array_to_string(array_agg(artist_id), ',')
               FROM track_artist
               WHERE track_id = t.id
             ),
             ''
           ) AS artist_ids
         FROM tracks t
         INNER JOIN releases r ON r.id = t.release_id
         WHERE r.id = ANY($1)
           AND t.isrc IS NOT NULL AND t.isrc != ''
         ORDER BY t.isrc`,
        [releaseUpsertIds]
      );

      if (rows.length > 0) {
        const chData: TrackSyncRow[] = rows.map((row: any) => ({
          isrc: row.isrc,
          tenant_id: row.tenant_id ?? '',
          release_id: row.release_id ?? '',
          label_id: row.label_id ?? '',
          artist_ids: row.artist_ids ? row.artist_ids.split(',') : [],
          is_deleted: 0,
          updated_at: now,
        }));
        await this.clickHouseService.insert(
          CLICKHOUSE_TABLES.PG_TRACKS_SYNC,
          chData
        );
      }
    }

    // 3. Xu ly INSERT/UPDATE cho dsps
    if (dspUpsertIds.length > 0) {
      const rows = await this.entityManager.query(
        `SELECT id, code, name, code_ci
         FROM dsps
         WHERE id = ANY($1)`,
        [dspUpsertIds]
      );

      if (rows.length > 0) {
        const chData: DspSyncRow[] = rows.map((row: any) => ({
          pg_uuid: row.id,
          dsp_code: row.code ?? '',
          dsp_name: row.name ?? '',
          dsp_ci_code: row.code_ci ?? '',
          created_at: now,
          updated_at: now,
        }));
        await this.clickHouseService.insert(
          CLICKHOUSE_TABLES.PG_DSPS_SYNC,
          chData
        );
      }
    }
  }

  // ======================================================
  // CRON: Don dep lich su dong bo cu hon 3 ngay
  // ======================================================

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async pruneOldSyncLogs() {
    this.logger.log(
      'Starting cleanup of processed sync logs older than 3 days...'
    );
    try {
      const result = await this.entityManager.query(
        `DELETE FROM clickhouse_sync_outbox
         WHERE processed = true
           AND processed_at < NOW() - INTERVAL '3 days'`
      );
      const deletedCount = result?.[1] ?? 0;
      this.logger.log(
        `Cleanup complete: removed ${deletedCount} old sync log(s).`
      );
    } catch (err: any) {
      this.logger.error(`Cleanup failed: ${err.message}`);
    }
  }

  // ======================================================
  // LIFECYCLE: Tat
  // ======================================================

  async onModuleDestroy() {
    if (this.pgListenClient) {
      await this.pgListenClient.end().catch(() => {});
      this.pgListenClient = null;
      this.logger.log('LISTEN connection closed.');
    }
  }
}
