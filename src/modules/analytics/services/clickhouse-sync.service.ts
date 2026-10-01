import {
	Injectable,
	Logger,
	OnModuleDestroy,
	OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectEntityManager } from '@nestjs/typeorm';
import { Client } from 'pg';
import { ClickHouseMigrationService } from 'src/modules/clickhouse/clickhouse-migration.service';
import { CLICKHOUSE_TABLES } from 'src/modules/clickhouse/clickhouse.constants';
import { ClickHouseService } from 'src/modules/clickhouse/clickhouse.service';
import { DspSeedingService } from 'src/modules/dsp/services/dsp-seeding.service';
import { EntityManager } from 'typeorm';

// So ban ghi xu ly moi lan quet outbox
const OUTBOX_BATCH_SIZE = 200;

// So ban ghi insert moi batch khi initial sync
const INITIAL_SYNC_BATCH_SIZE = 2000;

// Moi chunk ownership: loc tracks/videos theo release, khong quet ca catalog.
const OWNERSHIP_SYNC_RELEASE_CHUNK = 100;
const OWNERSHIP_SYNC_INSERT_BATCH = 5_000;

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
	release_upc: string;
	label_id: string;
	artist_ids: string[];
	release_type: string;
	channel_id: string;
	external_id: string;
	is_deleted: number;
	updated_at: string;
	track_title: string;
	track_version: string;
	release_title: string;
	label_name: string;
	artist_names: string[];
	cover_75: string;
	cover_100: string;
	cover_160: string;
	cover_300: string;
	cover_original: string;
	track_metadata_spotify: string;
	track_metadata_deezer: string;
	release_metadata_spotify: string;
	release_metadata_deezer: string;
}

interface DspSyncRow {
	[key: string]: any;
	pg_uuid: string;
	dsp_code: string;
	dsp_name: string;
	dsp_ci_code: string;
	picture: string;
	type: string;
	created_at: string;
	updated_at: string;
}

interface AssetOwnershipSyncRow extends Record<string, unknown> {
	isrc: string;
	release_id: string;
	tenant_id: string;
	label_id: string;
	effective_from: string;
	effective_to: string | null;
	revenue_effective_from: string;
	revenue_effective_to: string | null;
	is_deleted: number;
	updated_at: string;
}

@Injectable()
export class ClickHouseSyncService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(ClickHouseSyncService.name);
	private pgListenClient: Client | null = null;
	private isProcessing = false;
	private pendingDrain = false;

	constructor(
		@InjectEntityManager()
		private readonly entityManager: EntityManager,
		private readonly clickHouseService: ClickHouseService,
		private readonly configService: ConfigService,
		private readonly seedingService: DspSeedingService,
		private readonly clickHouseMigrationService: ClickHouseMigrationService,
	) {}

	// ======================================================
	// LIFECYCLE: Khoi dong
	// ======================================================

	onModuleInit() {
		if (process.env.APP_ROLE !== 'worker') {
			this.logger.debug(
				'Skipping ClickHouse sync listener (not worker role)',
			);
			return;
		}
		this.initializeSyncInBackground().catch((err) => {
			this.logger.error(
				`ClickHouse background sync initialization failed: ${err.message}`,
				err.stack,
			);
		});
	}

	private async initializeSyncInBackground() {
		// Wait for ClickHouse migrations to finish first
		await this.clickHouseMigrationService.waitForMigrations();

		// 1. Sync dsps from PostgreSQL to ClickHouse pg_dsps_sync on startup
		await this.syncDspsOnStartup();

		// Ownership is a compact financial dimension. It must not wait behind the
		// potentially long pg_tracks_sync backfill, otherwise a completed asset
		// transfer can be missing from reports for many minutes after a restart.
		await this.performFullOwnershipSync();
		await this.processOutboxQueue();
		await this.startListening();

		// Full backfill can take a long time on a large catalogue. It must not
		// delay LISTEN/NOTIFY, otherwise normal release edits and asset transfers
		// wait behind the whole catalogue on every worker restart.
		this.runInitialSyncIfNeeded().catch((err) => {
			this.logger.error(`Initial sync failed: ${err.message}`, err.stack);
		});
	}

	private async syncDspsOnStartup() {
		try {
			this.logger.log(
				'Refreshing pg_dsps_sync table from PostgreSQL dsps...',
			);
			const count = await this.seedingService.resyncAll();
			this.logger.log(`DSP seeding completed, synced ${count} records`);
		} catch (err: any) {
			this.logger.error(`DSP seeding on startup failed: ${err.message}`);
		}
	}

	// ======================================================
	// INITIAL SYNC: Tu dong dong bo du lieu cu khi start
	// ======================================================

	private async runInitialSyncIfNeeded() {
		try {
			const forceSync =
				this.configService.get<string>('FORCE_INITIAL_SYNC') === 'true';

			// Only seed an empty ClickHouse table automatically. Metadata can
			// legitimately be blank and ReplacingMergeTree's non-FINAL row count
			// includes old versions, therefore neither is a safe full-rebuild signal.
			// Ongoing edits are covered by the PostgreSQL outbox instead.
			const countResult = await this.clickHouseService.query<{
				c: string;
			}>(
				`SELECT count() AS c
				 FROM ${CLICKHOUSE_TABLES.PG_TRACKS_SYNC} FINAL
				 WHERE is_deleted = 0`,
			);
			const chCount = Number(countResult[0]?.c ?? 0);
			const pgCountResult = await this.entityManager.query(
				`SELECT COUNT(DISTINCT isrc) AS c
				 FROM (
				   SELECT isrc FROM tracks WHERE isrc IS NOT NULL AND isrc != ''
				   UNION
				   SELECT isrc FROM videos WHERE isrc IS NOT NULL AND isrc != ''
				   UNION
				   SELECT stat_key AS isrc FROM release_stat_identities WHERE active = true
				 ) AS combined`,
			);
			const pgCount = Number(pgCountResult[0]?.c ?? 0);

			this.logger.log(
				`Initial sync check: ClickHouse FINAL=${chCount} ISRCs, Postgres=${pgCount} ISRCs, forceSync=${forceSync}`,
			);

			if (forceSync || (chCount === 0 && pgCount > 0)) {
				this.logger.log(
					`Starting full initial sync from Postgres to ClickHouse (${pgCount} ISRCs)...`,
				);
				await this.performFullSync();
				this.logger.log('Full initial sync completed successfully.');
			} else {
				this.logger.log(
					'ClickHouse is already seeded; changes will be handled incrementally by the outbox.',
				);
			}
		} catch (err: any) {
			this.logger.error(`Initial sync check failed: ${err.message}`);
			// Khong throw - cho phep app tiep tuc chay du sync that bai
		}
	}

	async performFullSync() {
		let lastIsrc = '';
		let totalSynced = 0;

		while (true) {
			// Lay tung cum tu Postgres de tranh qua tai RAM
			const rows = await this.entityManager.query(
				`SELECT DISTINCT ON (isrc)
           isrc,
           tenant_id,
           release_id,
           release_upc,
           label_id,
           artist_ids,
           release_type,
           channel_id,
           external_id,
           track_title,
           track_version,
           release_title,
           label_name,
           artist_names,
           cover_75,
           cover_100,
           cover_160,
           cover_300,
           cover_original,
           track_metadata_spotify,
           track_metadata_deezer,
           release_metadata_spotify,
           release_metadata_deezer
         FROM (
           SELECT
             t.isrc AS isrc,
             r.tenant_id AS tenant_id,
             r.id AS release_id,
             COALESCE(r.upc, '') AS release_upc,
             COALESCE(r.label_id, '') AS label_id,
             COALESCE(
               (
                 SELECT array_to_string(array_agg(artist_id), ',')
                 FROM track_artist
                 WHERE track_id = t.id
               ),
               ''
             ) AS artist_ids,
             'audio' AS release_type,
             '' AS channel_id,
             '' AS external_id,
             COALESCE(t.title, '') AS track_title,
             COALESCE(t.version, '') AS track_version,
             COALESCE(r.title, '') AS release_title,
             COALESCE(l.name, '') AS label_name,
             COALESCE(
               (
                 SELECT array_to_string(array_agg(a.name ORDER BY a.name), '||')
                 FROM track_artist ta
                 JOIN artists a ON a.id = ta.artist_id
                 WHERE ta.track_id = t.id
               ),
               ''
             ) AS artist_names,
             COALESCE((SELECT rca.file_id::text FROM release_cover_art rca WHERE rca.release_id = r.id AND rca.type = '75x75' LIMIT 1), '') AS cover_75,
             COALESCE((SELECT rca.file_id::text FROM release_cover_art rca WHERE rca.release_id = r.id AND rca.type = '100x100' LIMIT 1), '') AS cover_100,
             COALESCE((SELECT rca.file_id::text FROM release_cover_art rca WHERE rca.release_id = r.id AND rca.type = '160x160' LIMIT 1), '') AS cover_160,
             COALESCE((SELECT rca.file_id::text FROM release_cover_art rca WHERE rca.release_id = r.id AND rca.type = '300x300' LIMIT 1), '') AS cover_300,
             COALESCE((SELECT rca.file_id::text FROM release_cover_art rca WHERE rca.release_id = r.id AND rca.type = 'original' LIMIT 1), '') AS cover_original,
             COALESCE(t.metadata_spotify::text, '') AS track_metadata_spotify,
             COALESCE(t.metadata_deezer::text, '') AS track_metadata_deezer,
             COALESCE(r.metadata_spotify::text, '') AS release_metadata_spotify,
             COALESCE(r.metadata_deezer::text, '') AS release_metadata_deezer
           FROM tracks t
           INNER JOIN releases r ON r.id = t.release_id
           LEFT JOIN labels l ON l.id = r.label_id
           WHERE t.isrc IS NOT NULL AND t.isrc != ''

           UNION ALL

           SELECT
             v.isrc AS isrc,
             r.tenant_id AS tenant_id,
             r.id AS release_id,
             COALESCE(r.upc, '') AS release_upc,
             COALESCE(r.label_id, '') AS label_id,
             COALESCE(
               (
                 SELECT array_to_string(array_agg(artist_id), ',')
                 FROM video_artist
                 WHERE video_id = v.id
               ),
               ''
             ) AS artist_ids,
             'video' AS release_type,
             COALESCE(v.channel_id::text, '') AS channel_id,
             COALESCE(v.external_id, '') AS external_id,
             COALESCE(r.title, '') AS track_title,
             '' AS track_version,
             COALESCE(r.title, '') AS release_title,
             COALESCE(l.name, '') AS label_name,
             COALESCE(
               (
                 SELECT array_to_string(array_agg(a.name ORDER BY a.name), '||')
                 FROM video_artist va
                 JOIN artists a ON a.id = va.artist_id
                 WHERE va.video_id = v.id
               ),
               ''
             ) AS artist_names,
             COALESCE((SELECT rca.file_id::text FROM release_cover_art rca WHERE rca.release_id = r.id AND rca.type = '75x75' LIMIT 1), '') AS cover_75,
             COALESCE((SELECT rca.file_id::text FROM release_cover_art rca WHERE rca.release_id = r.id AND rca.type = '100x100' LIMIT 1), '') AS cover_100,
             COALESCE((SELECT rca.file_id::text FROM release_cover_art rca WHERE rca.release_id = r.id AND rca.type = '160x160' LIMIT 1), '') AS cover_160,
             COALESCE((SELECT rca.file_id::text FROM release_cover_art rca WHERE rca.release_id = r.id AND rca.type = '300x300' LIMIT 1), '') AS cover_300,
             COALESCE((SELECT rca.file_id::text FROM release_cover_art rca WHERE rca.release_id = r.id AND rca.type = 'original' LIMIT 1), '') AS cover_original,
             '' AS track_metadata_spotify,
             '' AS track_metadata_deezer,
             COALESCE(r.metadata_spotify::text, '') AS release_metadata_spotify,
             COALESCE(r.metadata_deezer::text, '') AS release_metadata_deezer
           FROM videos v
           INNER JOIN releases r ON r.id = v.release_id
           LEFT JOIN labels l ON l.id = r.label_id
           WHERE v.isrc IS NOT NULL AND v.isrc != ''

		   UNION ALL

		   SELECT
		     si.stat_key AS isrc,
		     r.tenant_id AS tenant_id,
		     r.id AS release_id,
		     COALESCE(r.upc, '') AS release_upc,
		     COALESCE(r.label_id, '') AS label_id,
		     '' AS artist_ids,
		     r.type AS release_type,
		     '' AS channel_id,
		     '' AS external_id,
		     COALESCE(r.title, '') AS track_title,
		     '' AS track_version,
		     COALESCE(r.title, '') AS release_title,
		     COALESCE(l.name, '') AS label_name,
		     '' AS artist_names,
		     COALESCE((SELECT rca.file_id::text FROM release_cover_art rca WHERE rca.release_id = r.id AND rca.type = '75x75' LIMIT 1), '') AS cover_75,
		     COALESCE((SELECT rca.file_id::text FROM release_cover_art rca WHERE rca.release_id = r.id AND rca.type = '100x100' LIMIT 1), '') AS cover_100,
		     COALESCE((SELECT rca.file_id::text FROM release_cover_art rca WHERE rca.release_id = r.id AND rca.type = '160x160' LIMIT 1), '') AS cover_160,
		     COALESCE((SELECT rca.file_id::text FROM release_cover_art rca WHERE rca.release_id = r.id AND rca.type = '300x300' LIMIT 1), '') AS cover_300,
		     COALESCE((SELECT rca.file_id::text FROM release_cover_art rca WHERE rca.release_id = r.id AND rca.type = 'original' LIMIT 1), '') AS cover_original,
		     '' AS track_metadata_spotify,
		     '' AS track_metadata_deezer,
		     COALESCE(r.metadata_spotify::text, '') AS release_metadata_spotify,
		     COALESCE(r.metadata_deezer::text, '') AS release_metadata_deezer
		   FROM release_stat_identities si
		   JOIN releases r ON r.id = si.release_id
		   LEFT JOIN labels l ON l.id = r.label_id
		   WHERE si.active = true
			 ) AS combined
         WHERE isrc > $2
         ORDER BY isrc
         LIMIT $1`,
				[INITIAL_SYNC_BATCH_SIZE, lastIsrc],
			);

			if (rows.length === 0) break;

			const chData: TrackSyncRow[] = rows.map((row: any) => ({
				isrc: row.isrc,
				tenant_id: row.tenant_id ?? '',
				release_id: row.release_id ?? '',
				release_upc: row.release_upc ?? '',
				label_id: row.label_id ?? '',
				artist_ids: row.artist_ids ? row.artist_ids.split(',') : [],
				release_type: row.release_type ?? 'audio',
				channel_id: row.channel_id ?? '',
				external_id: row.external_id ?? '',
				is_deleted: 0,
				updated_at: new Date()
					.toISOString()
					.slice(0, 19)
					.replace('T', ' '),
				track_title: row.track_title ?? '',
				track_version: row.track_version ?? '',
				release_title: row.release_title ?? '',
				label_name: row.label_name ?? '',
				artist_names: row.artist_names
					? row.artist_names.split('||').filter(Boolean)
					: [],
				cover_75: row.cover_75 ?? '',
				cover_100: row.cover_100 ?? '',
				cover_160: row.cover_160 ?? '',
				cover_300: row.cover_300 ?? '',
				cover_original: row.cover_original ?? '',
				track_metadata_spotify: row.track_metadata_spotify ?? '',
				track_metadata_deezer: row.track_metadata_deezer ?? '',
				release_metadata_spotify: row.release_metadata_spotify ?? '',
				release_metadata_deezer: row.release_metadata_deezer ?? '',
			}));

			await this.clickHouseService.insert(
				CLICKHOUSE_TABLES.PG_TRACKS_SYNC,
				chData,
			);

			totalSynced += rows.length;
			lastIsrc = rows[rows.length - 1].isrc;

			this.logger.log(
				`Initial sync progress: ${totalSynced} ISRCs synced`,
			);
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
				'LISTEN connection established on channel [clickhouse_sync_channel]',
			);

			this.pgListenClient.on('notification', async () => {
				this.logger.debug('Received sync notification from Postgres');
				await this.processOutboxQueue();
			});

			this.pgListenClient.on('error', (err: any) => {
				this.logger.error(
					`LISTEN connection error: ${err.message}. Reconnecting in 5s...`,
				);
				this.scheduleReconnect();
			});
		} catch (err: any) {
			this.logger.error(
				`Failed to start LISTEN connection: ${err.message}. Reconnecting in 10s...`,
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
		if (this.isProcessing) {
			this.pendingDrain = true;
			return;
		}
		this.isProcessing = true;

		try {
			do {
				this.pendingDrain = false;
				while (true) {
					const jobs: OutboxJob[] = await this.entityManager.query(
						`SELECT id, entity_name, entity_id, action
           FROM clickhouse_sync_outbox
           WHERE processed = false
           ORDER BY created_at ASC
           LIMIT $1`,
						[OUTBOX_BATCH_SIZE],
					);

					if (jobs.length === 0) break;

					this.logger.log(
						`Processing ${jobs.length} sync jobs from outbox...`,
					);

					try {
						await this.syncJobsToClickHouse(jobs);

						// Danh dau hoan tat
						const jobIds = jobs.map((j) => j.id);
						await this.entityManager.query(
							`UPDATE clickhouse_sync_outbox
             SET processed = true, processed_at = NOW(), error_message = NULL
             WHERE id = ANY($1)`,
							[jobIds],
						);

						this.logger.log(
							`Synced ${jobs.length} jobs to ClickHouse successfully.`,
						);
					} catch (err: any) {
						// Ghi nhan loi nhung KHONG cap nhat processed → se retry lan sau
						this.logger.error(`Sync batch failed: ${err.message}`);
						const jobIds = jobs.map((j) => j.id);
						await this.entityManager.query(
							`UPDATE clickhouse_sync_outbox
             SET error_message = $1
             WHERE id = ANY($2) AND processed = false`,
							[err.message.substring(0, 500), jobIds],
						);
						this.pendingDrain = false;
						break;
					}
				}
			} while (this.pendingDrain);
		} finally {
			this.isProcessing = false;
			if (this.pendingDrain) {
				this.pendingDrain = false;
				void this.processOutboxQueue();
			}
		}
	}

	private async syncJobsToClickHouse(jobs: OutboxJob[]) {
		// Phan loai jobs theo entity va action
		const trackUpsertIds = jobs
			.filter((j) => j.entity_name === 'tracks' && j.action !== 'DELETE')
			.map((j) => j.entity_id);

		const videoUpsertIds = jobs
			.filter((j) => j.entity_name === 'videos' && j.action !== 'DELETE')
			.map((j) => j.entity_id);

		const releaseUpsertIds = jobs
			.filter(
				(j) => j.entity_name === 'releases' && j.action !== 'DELETE',
			)
			.map((j) => j.entity_id);

		const dspUpsertIds = jobs
			.filter((j) => j.entity_name === 'dsps' && j.action !== 'DELETE')
			.map((j) => j.entity_id);

		const ownershipReleaseIds = jobs
			.filter(
				(j) =>
					j.entity_name === 'asset_ownership_periods' &&
					j.action !== 'DELETE',
			)
			.map((j) => j.entity_id);

		// Job DELETE sinh ra tu PG trigger AFTER DELETE tren asset_ownership_periods
		// (ban chay ca khi row bi xoa do FK CASCADE tu lenh xoa release). entity_id
		// la release_id, khong phai PK cua row period.
		const ownershipDeleteReleaseIds = jobs
			.filter(
				(j) =>
					j.entity_name === 'asset_ownership_periods' &&
					j.action === 'DELETE' &&
					!!j.entity_id,
			)
			.map((j) => j.entity_id);

		const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

		if (ownershipReleaseIds.length > 0) {
			await this.syncOwnershipForReleases(ownershipReleaseIds);
		}

		if (ownershipDeleteReleaseIds.length > 0) {
			await this.tombstoneOwnershipForReleases(ownershipDeleteReleaseIds);
		}

		// 1a. Xu ly INSERT/UPDATE cho tracks
		if (trackUpsertIds.length > 0) {
			const rows = await this.entityManager.query(
				`SELECT DISTINCT ON (t.isrc)
           t.isrc AS isrc,
           r.tenant_id AS tenant_id,
           r.id AS release_id,
           COALESCE(r.upc, '') AS release_upc,
           COALESCE(r.label_id, '') AS label_id,
           COALESCE(
             (
               SELECT array_to_string(array_agg(artist_id), ',')
               FROM track_artist
               WHERE track_id = t.id
             ),
             ''
           ) AS artist_ids,
           COALESCE(t.title, '') AS track_title,
           COALESCE(t.version, '') AS track_version,
           COALESCE(r.title, '') AS release_title,
           COALESCE(l.name, '') AS label_name,
           COALESCE(
             (
               SELECT array_to_string(array_agg(a.name ORDER BY a.name), '||')
               FROM track_artist ta
               JOIN artists a ON a.id = ta.artist_id
               WHERE ta.track_id = t.id
             ),
             ''
           ) AS artist_names,
           COALESCE((SELECT rca.file_id::text FROM release_cover_art rca WHERE rca.release_id = r.id AND rca.type = '75x75' LIMIT 1), '') AS cover_75,
           COALESCE((SELECT rca.file_id::text FROM release_cover_art rca WHERE rca.release_id = r.id AND rca.type = '100x100' LIMIT 1), '') AS cover_100,
           COALESCE((SELECT rca.file_id::text FROM release_cover_art rca WHERE rca.release_id = r.id AND rca.type = '160x160' LIMIT 1), '') AS cover_160,
           COALESCE((SELECT rca.file_id::text FROM release_cover_art rca WHERE rca.release_id = r.id AND rca.type = '300x300' LIMIT 1), '') AS cover_300,
           COALESCE((SELECT rca.file_id::text FROM release_cover_art rca WHERE rca.release_id = r.id AND rca.type = 'original' LIMIT 1), '') AS cover_original,
           COALESCE(t.metadata_spotify::text, '') AS track_metadata_spotify,
           COALESCE(t.metadata_deezer::text, '') AS track_metadata_deezer,
           COALESCE(r.metadata_spotify::text, '') AS release_metadata_spotify,
           COALESCE(r.metadata_deezer::text, '') AS release_metadata_deezer
         FROM tracks t
         INNER JOIN releases r ON r.id = t.release_id
         LEFT JOIN labels l ON l.id = r.label_id
         WHERE t.id = ANY($1)
           AND t.isrc IS NOT NULL AND t.isrc != ''
         ORDER BY t.isrc`,
				[trackUpsertIds],
			);

			if (rows.length > 0) {
				const chData: TrackSyncRow[] = rows.map((row: any) => ({
					isrc: row.isrc,
					tenant_id: row.tenant_id ?? '',
					release_id: row.release_id ?? '',
					release_upc: row.release_upc ?? '',
					label_id: row.label_id ?? '',
					artist_ids: row.artist_ids ? row.artist_ids.split(',') : [],
					release_type: 'audio',
					channel_id: '',
					external_id: '',
					is_deleted: 0,
					updated_at: now,
					track_title: row.track_title ?? '',
					track_version: row.track_version ?? '',
					release_title: row.release_title ?? '',
					label_name: row.label_name ?? '',
					artist_names: row.artist_names
						? row.artist_names.split('||').filter(Boolean)
						: [],
					cover_75: row.cover_75 ?? '',
					cover_100: row.cover_100 ?? '',
					cover_160: row.cover_160 ?? '',
					cover_300: row.cover_300 ?? '',
					cover_original: row.cover_original ?? '',
					track_metadata_spotify: row.track_metadata_spotify ?? '',
					track_metadata_deezer: row.track_metadata_deezer ?? '',
					release_metadata_spotify:
						row.release_metadata_spotify ?? '',
					release_metadata_deezer: row.release_metadata_deezer ?? '',
				}));
				await this.clickHouseService.insert(
					CLICKHOUSE_TABLES.PG_TRACKS_SYNC,
					chData,
				);
			}
		}

		// 1b. Xu ly INSERT/UPDATE cho videos
		if (videoUpsertIds.length > 0) {
			const rows = await this.entityManager.query(
				`SELECT DISTINCT ON (v.isrc)
           v.isrc AS isrc,
           r.tenant_id AS tenant_id,
           r.id AS release_id,
           COALESCE(r.upc, '') AS release_upc,
           COALESCE(r.label_id, '') AS label_id,
           COALESCE(
             (
               SELECT array_to_string(array_agg(artist_id), ',')
               FROM video_artist
               WHERE video_id = v.id
             ),
             ''
           ) AS artist_ids,
           COALESCE(v.channel_id::text, '') AS channel_id,
           COALESCE(v.external_id, '') AS external_id,
           COALESCE(r.title, '') AS track_title,
           '' AS track_version,
           COALESCE(r.title, '') AS release_title,
           COALESCE(l.name, '') AS label_name,
           COALESCE(
             (
               SELECT array_to_string(array_agg(a.name ORDER BY a.name), '||')
               FROM video_artist va
               JOIN artists a ON a.id = va.artist_id
               WHERE va.video_id = v.id
             ),
             ''
           ) AS artist_names,
           COALESCE((SELECT rca.file_id::text FROM release_cover_art rca WHERE rca.release_id = r.id AND rca.type = '75x75' LIMIT 1), '') AS cover_75,
           COALESCE((SELECT rca.file_id::text FROM release_cover_art rca WHERE rca.release_id = r.id AND rca.type = '100x100' LIMIT 1), '') AS cover_100,
           COALESCE((SELECT rca.file_id::text FROM release_cover_art rca WHERE rca.release_id = r.id AND rca.type = '160x160' LIMIT 1), '') AS cover_160,
           COALESCE((SELECT rca.file_id::text FROM release_cover_art rca WHERE rca.release_id = r.id AND rca.type = '300x300' LIMIT 1), '') AS cover_300,
           COALESCE((SELECT rca.file_id::text FROM release_cover_art rca WHERE rca.release_id = r.id AND rca.type = 'original' LIMIT 1), '') AS cover_original,
           '' AS track_metadata_spotify,
           '' AS track_metadata_deezer,
           COALESCE(r.metadata_spotify::text, '') AS release_metadata_spotify,
           COALESCE(r.metadata_deezer::text, '') AS release_metadata_deezer
         FROM videos v
         INNER JOIN releases r ON r.id = v.release_id
         LEFT JOIN labels l ON l.id = r.label_id
         WHERE v.id = ANY($1)
           AND v.isrc IS NOT NULL AND v.isrc != ''
         ORDER BY v.isrc`,
				[videoUpsertIds],
			);

			if (rows.length > 0) {
				const chData: TrackSyncRow[] = rows.map((row: any) => ({
					isrc: row.isrc,
					tenant_id: row.tenant_id ?? '',
					release_id: row.release_id ?? '',
					release_upc: row.release_upc ?? '',
					label_id: row.label_id ?? '',
					artist_ids: row.artist_ids ? row.artist_ids.split(',') : [],
					release_type: 'video',
					channel_id: row.channel_id ?? '',
					external_id: row.external_id ?? '',
					is_deleted: 0,
					updated_at: now,
					track_title: row.track_title ?? '',
					track_version: row.track_version ?? '',
					release_title: row.release_title ?? '',
					label_name: row.label_name ?? '',
					artist_names: row.artist_names
						? row.artist_names.split('||').filter(Boolean)
						: [],
					cover_75: row.cover_75 ?? '',
					cover_100: row.cover_100 ?? '',
					cover_160: row.cover_160 ?? '',
					cover_300: row.cover_300 ?? '',
					cover_original: row.cover_original ?? '',
					track_metadata_spotify: row.track_metadata_spotify ?? '',
					track_metadata_deezer: row.track_metadata_deezer ?? '',
					release_metadata_spotify:
						row.release_metadata_spotify ?? '',
					release_metadata_deezer: row.release_metadata_deezer ?? '',
				}));
				await this.clickHouseService.insert(
					CLICKHOUSE_TABLES.PG_TRACKS_SYNC,
					chData,
				);
			}
		}

		// 2. Xu ly INSERT/UPDATE cho releases (cap nhat tat ca tracks va videos trong release do)
		if (releaseUpsertIds.length > 0) {
			const rows = await this.entityManager.query(
				`SELECT DISTINCT ON (isrc)
           isrc,
           tenant_id,
           release_id,
           release_upc,
           label_id,
           artist_ids,
           release_type,
           channel_id,
           external_id,
           track_title,
           track_version,
           release_title,
           label_name,
           artist_names,
           cover_75,
           cover_100,
           cover_160,
           cover_300,
           cover_original,
           track_metadata_spotify,
           track_metadata_deezer,
           release_metadata_spotify,
           release_metadata_deezer
         FROM (
           SELECT
             t.isrc AS isrc,
             r.tenant_id AS tenant_id,
             r.id AS release_id,
             COALESCE(r.upc, '') AS release_upc,
             COALESCE(r.label_id, '') AS label_id,
             COALESCE(
               (
                 SELECT array_to_string(array_agg(artist_id), ',')
                 FROM track_artist
                 WHERE track_id = t.id
               ),
               ''
             ) AS artist_ids,
             'audio' AS release_type,
             '' AS channel_id,
             '' AS external_id,
             COALESCE(t.title, '') AS track_title,
             COALESCE(t.version, '') AS track_version,
             COALESCE(r.title, '') AS release_title,
             COALESCE(l.name, '') AS label_name,
             COALESCE(
               (
                 SELECT array_to_string(array_agg(a.name ORDER BY a.name), '||')
                 FROM track_artist ta
                 JOIN artists a ON a.id = ta.artist_id
                 WHERE ta.track_id = t.id
               ),
               ''
             ) AS artist_names,
             COALESCE((SELECT rca.file_id::text FROM release_cover_art rca WHERE rca.release_id = r.id AND rca.type = '75x75' LIMIT 1), '') AS cover_75,
             COALESCE((SELECT rca.file_id::text FROM release_cover_art rca WHERE rca.release_id = r.id AND rca.type = '100x100' LIMIT 1), '') AS cover_100,
             COALESCE((SELECT rca.file_id::text FROM release_cover_art rca WHERE rca.release_id = r.id AND rca.type = '160x160' LIMIT 1), '') AS cover_160,
             COALESCE((SELECT rca.file_id::text FROM release_cover_art rca WHERE rca.release_id = r.id AND rca.type = '300x300' LIMIT 1), '') AS cover_300,
             COALESCE((SELECT rca.file_id::text FROM release_cover_art rca WHERE rca.release_id = r.id AND rca.type = 'original' LIMIT 1), '') AS cover_original,
             COALESCE(t.metadata_spotify::text, '') AS track_metadata_spotify,
             COALESCE(t.metadata_deezer::text, '') AS track_metadata_deezer,
             COALESCE(r.metadata_spotify::text, '') AS release_metadata_spotify,
             COALESCE(r.metadata_deezer::text, '') AS release_metadata_deezer
           FROM tracks t
           INNER JOIN releases r ON r.id = t.release_id
           LEFT JOIN labels l ON l.id = r.label_id
           WHERE r.id = ANY($1)
             AND t.isrc IS NOT NULL AND t.isrc != ''

           UNION ALL

           SELECT
             v.isrc AS isrc,
             r.tenant_id AS tenant_id,
             r.id AS release_id,
             COALESCE(r.upc, '') AS release_upc,
             COALESCE(r.label_id, '') AS label_id,
             COALESCE(
               (
                 SELECT array_to_string(array_agg(artist_id), ',')
                 FROM video_artist
                 WHERE video_id = v.id
               ),
               ''
             ) AS artist_ids,
             'video' AS release_type,
             COALESCE(v.channel_id::text, '') AS channel_id,
             COALESCE(v.external_id, '') AS external_id,
             COALESCE(r.title, '') AS track_title,
             '' AS track_version,
             COALESCE(r.title, '') AS release_title,
             COALESCE(l.name, '') AS label_name,
             COALESCE(
               (
                 SELECT array_to_string(array_agg(a.name ORDER BY a.name), '||')
                 FROM video_artist va
                 JOIN artists a ON a.id = va.artist_id
                 WHERE va.video_id = v.id
               ),
               ''
             ) AS artist_names,
             COALESCE((SELECT rca.file_id::text FROM release_cover_art rca WHERE rca.release_id = r.id AND rca.type = '75x75' LIMIT 1), '') AS cover_75,
             COALESCE((SELECT rca.file_id::text FROM release_cover_art rca WHERE rca.release_id = r.id AND rca.type = '100x100' LIMIT 1), '') AS cover_100,
             COALESCE((SELECT rca.file_id::text FROM release_cover_art rca WHERE rca.release_id = r.id AND rca.type = '160x160' LIMIT 1), '') AS cover_160,
             COALESCE((SELECT rca.file_id::text FROM release_cover_art rca WHERE rca.release_id = r.id AND rca.type = '300x300' LIMIT 1), '') AS cover_300,
             COALESCE((SELECT rca.file_id::text FROM release_cover_art rca WHERE rca.release_id = r.id AND rca.type = 'original' LIMIT 1), '') AS cover_original,
             '' AS track_metadata_spotify,
             '' AS track_metadata_deezer,
             COALESCE(r.metadata_spotify::text, '') AS release_metadata_spotify,
             COALESCE(r.metadata_deezer::text, '') AS release_metadata_deezer
           FROM videos v
           INNER JOIN releases r ON r.id = v.release_id
           LEFT JOIN labels l ON l.id = r.label_id
           WHERE r.id = ANY($1)
             AND v.isrc IS NOT NULL AND v.isrc != ''

		 UNION ALL

		 SELECT
		   si.stat_key AS isrc,
		   r.tenant_id AS tenant_id,
		   r.id AS release_id,
		   COALESCE(r.upc, '') AS release_upc,
		   COALESCE(r.label_id, '') AS label_id,
		   '' AS artist_ids,
		   r.type AS release_type,
		   '' AS channel_id,
		   '' AS external_id,
		   COALESCE(r.title, '') AS track_title,
		   '' AS track_version,
		   COALESCE(r.title, '') AS release_title,
		   COALESCE(l.name, '') AS label_name,
		   '' AS artist_names,
		   COALESCE((SELECT rca.file_id::text FROM release_cover_art rca WHERE rca.release_id = r.id AND rca.type = '75x75' LIMIT 1), '') AS cover_75,
		   COALESCE((SELECT rca.file_id::text FROM release_cover_art rca WHERE rca.release_id = r.id AND rca.type = '100x100' LIMIT 1), '') AS cover_100,
		   COALESCE((SELECT rca.file_id::text FROM release_cover_art rca WHERE rca.release_id = r.id AND rca.type = '160x160' LIMIT 1), '') AS cover_160,
		   COALESCE((SELECT rca.file_id::text FROM release_cover_art rca WHERE rca.release_id = r.id AND rca.type = '300x300' LIMIT 1), '') AS cover_300,
		   COALESCE((SELECT rca.file_id::text FROM release_cover_art rca WHERE rca.release_id = r.id AND rca.type = 'original' LIMIT 1), '') AS cover_original,
		   '' AS track_metadata_spotify,
		   '' AS track_metadata_deezer,
		   COALESCE(r.metadata_spotify::text, '') AS release_metadata_spotify,
		   COALESCE(r.metadata_deezer::text, '') AS release_metadata_deezer
		 FROM release_stat_identities si
		 JOIN releases r ON r.id = si.release_id
		 LEFT JOIN labels l ON l.id = r.label_id
		 WHERE si.active = true AND si.release_id = ANY($1)
         ) AS combined
         ORDER BY isrc`,
				[releaseUpsertIds],
			);

			if (rows.length > 0) {
				const chData: TrackSyncRow[] = rows.map((row: any) => ({
					isrc: row.isrc,
					tenant_id: row.tenant_id ?? '',
					release_id: row.release_id ?? '',
					release_upc: row.release_upc ?? '',
					label_id: row.label_id ?? '',
					artist_ids: row.artist_ids ? row.artist_ids.split(',') : [],
					release_type: row.release_type ?? 'audio',
					channel_id: row.channel_id ?? '',
					external_id: row.external_id ?? '',
					is_deleted: 0,
					updated_at: now,
					track_title: row.track_title ?? '',
					track_version: row.track_version ?? '',
					release_title: row.release_title ?? '',
					label_name: row.label_name ?? '',
					artist_names: row.artist_names
						? row.artist_names.split('||').filter(Boolean)
						: [],
					cover_75: row.cover_75 ?? '',
					cover_100: row.cover_100 ?? '',
					cover_160: row.cover_160 ?? '',
					cover_300: row.cover_300 ?? '',
					cover_original: row.cover_original ?? '',
					track_metadata_spotify: row.track_metadata_spotify ?? '',
					track_metadata_deezer: row.track_metadata_deezer ?? '',
					release_metadata_spotify:
						row.release_metadata_spotify ?? '',
					release_metadata_deezer: row.release_metadata_deezer ?? '',
				}));
				await this.clickHouseService.insert(
					CLICKHOUSE_TABLES.PG_TRACKS_SYNC,
					chData,
				);
			}
		}

		// 3. Xu ly INSERT/UPDATE cho dsps
		if (dspUpsertIds.length > 0) {
			const rows = await this.entityManager.query(
				`SELECT id, code, name, code_ci, picture, type
         FROM dsps
         WHERE id = ANY($1)`,
				[dspUpsertIds],
			);

			if (rows.length > 0) {
				const chData: DspSyncRow[] = rows.map((row: any) => ({
					pg_uuid: row.id,
					dsp_code: row.code ?? '',
					dsp_name: row.name ?? '',
					dsp_ci_code: row.code_ci ?? '',
					picture: row.picture ?? '',
					type: row.type ?? 'audio',
					created_at: now,
					updated_at: now,
				}));
				await this.clickHouseService.insert(
					CLICKHOUSE_TABLES.PG_DSPS_SYNC,
					chData,
				);
			}
		}
	}

	/** Sync all ISRCs of each release against every ownership window. */
	private async syncOwnershipForReleases(
		releaseIds: string[],
	): Promise<void> {
		const unique = [...new Set(releaseIds.filter(Boolean))];
		if (!unique.length) return;

		// One timestamp for the whole call so every chunk beats the previous
		// ClickHouse version together. Dedupe stays global: the same ISRC window
		// can show up on two releases that land in different chunks.
		const updatedAt = new Date().toISOString().slice(0, 23).replace('T', ' ');
		const deduped = new Map<string, AssetOwnershipSyncRow>();

		for (
			let offset = 0;
			offset < unique.length;
			offset += OWNERSHIP_SYNC_RELEASE_CHUNK
		) {
			const chunk = unique.slice(
				offset,
				offset + OWNERSHIP_SYNC_RELEASE_CHUNK,
			);
			const rows = await this.entityManager.query(
				`SELECT DISTINCT p.id, x.isrc, p.release_id, p.tenant_id, COALESCE(p.label_id, '') AS label_id,
				        to_char(p.effective_from, 'YYYY-MM-DD') AS effective_from,
				        to_char(p.effective_to, 'YYYY-MM-DD') AS effective_to,
				        to_char(p.revenue_effective_from, 'YYYY-MM-DD') AS revenue_effective_from,
				        to_char(p.revenue_effective_to, 'YYYY-MM-DD') AS revenue_effective_to,
				        p.updated_at
				 FROM asset_ownership_periods p
				 INNER JOIN (
				   SELECT release_id, isrc FROM tracks
				   WHERE release_id = ANY($1) AND isrc IS NOT NULL AND isrc != ''
				   UNION
				   SELECT release_id, isrc FROM videos
				   WHERE release_id = ANY($1) AND isrc IS NOT NULL AND isrc != ''
				   UNION
				   SELECT release_id, stat_key AS isrc FROM release_stat_identities
				   WHERE release_id = ANY($1) AND active = true
				 ) x ON x.release_id = p.release_id
				 WHERE p.release_id = ANY($1)`,
				[chunk],
			);
			for (const row of rows) {
				const mapped = this.toOwnershipSyncRow(row, updatedAt);
				const key = [
					mapped.isrc,
					mapped.effective_from,
					mapped.effective_to ?? '',
					mapped.revenue_effective_from,
					mapped.revenue_effective_to ?? '',
				].join('|');
				const existing = deduped.get(key);
				if (!existing || mapped.updated_at > existing.updated_at) {
					deduped.set(key, mapped);
				}
			}
		}

		if (!deduped.size) return;
		await this.clickHouseService.insertBatched(
			CLICKHOUSE_TABLES.PG_ASSET_OWNERSHIP_SYNC,
			Array.from(deduped.values()),
			OWNERSHIP_SYNC_INSERT_BATCH,
		);
	}

	private toOwnershipSyncRow(
		row: any,
		updatedAt: string,
	): AssetOwnershipSyncRow {
		return {
			isrc: row.isrc,
			release_id: row.release_id,
			tenant_id: row.tenant_id,
			label_id: row.label_id ?? '',
			effective_from: this.toClickHouseDate(row.effective_from),
			effective_to: row.effective_to
				? this.toClickHouseDate(row.effective_to)
				: null,
			revenue_effective_from: this.toClickHouseDate(
				row.revenue_effective_from,
			),
			revenue_effective_to: row.revenue_effective_to
				? this.toClickHouseDate(row.revenue_effective_to)
				: null,
			is_deleted: 0,
			updated_at: updatedAt,
		};
	}

	private toClickHouseDate(value: string | Date): string {
		// node-pg tra DATE thanh Date theo gio dia phuong. toISOString() lui 1 ngay
		// (o 1900 con lech offset lich su), roi ClickHouse Date ep ve 1970-01-01.
		if (typeof value === 'string') {
			const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
			if (match) return match[1];
		}
		if (value instanceof Date && !Number.isNaN(value.getTime())) {
			const month = String(value.getMonth() + 1).padStart(2, '0');
			const day = String(value.getDate()).padStart(2, '0');
			return `${value.getFullYear()}-${month}-${day}`;
		}
		throw new Error(
			`Invalid ownership date received from PostgreSQL: ${value}`,
		);
	}

	/**
	 * Danh dau tombstone (is_deleted=1) cho moi ownership row cua cac release da bi
	 * xoa o PG (qua FK CASCADE + trigger AFTER DELETE, xem migration
	 * 1787900000000-OwnershipCascadeAndSyncTrigger). Khong the doc tu PG vi row da
	 * bi xoa, nen doc truc tiep tu ClickHouse (noi van con du lieu sync truoc do,
	 * bao gom ca isrc) va insert lai chinh cac row do voi is_deleted=1, updated_at
	 * moi hon de ReplacingMergeTree collapse ve ban ghi tombstone.
	 * Dung query() voi named param, tuyet doi khong dung execute() (khong co binding,
	 * co nguy co SQL injection).
	 */
	private async tombstoneOwnershipForReleases(
		releaseIds: string[],
	): Promise<void> {
		const unique = [...new Set(releaseIds.filter(Boolean))];
		if (!unique.length) return;
		const now = new Date().toISOString().slice(0, 23).replace('T', ' ');
		for (
			let offset = 0;
			offset < unique.length;
			offset += OWNERSHIP_SYNC_RELEASE_CHUNK
		) {
			const chunk = unique.slice(
				offset,
				offset + OWNERSHIP_SYNC_RELEASE_CHUNK,
			);
			// Group by the sort key instead of FINAL. FINAL merges every part
			// before the release_id filter and is what blows AggregatingTransform
			// when a transfer has just written a lot of unmerged versions.
			const existing = await this.clickHouseService.query<{
				isrc: string;
				release_id: string;
				tenant_id: string;
				label_id: string;
				effective_from: string;
				effective_to: string | null;
				revenue_effective_from: string;
				revenue_effective_to: string | null;
			}>(
				`SELECT
				   isrc,
				   release_id,
				   argMax(tenant_id, updated_at) AS tenant_id,
				   argMax(label_id, updated_at) AS label_id,
				   effective_from,
				   argMax(effective_to, updated_at) AS effective_to,
				   argMax(revenue_effective_from, updated_at) AS revenue_effective_from,
				   argMax(revenue_effective_to, updated_at) AS revenue_effective_to
				 FROM music_analytics.${CLICKHOUSE_TABLES.PG_ASSET_OWNERSHIP_SYNC}
				 WHERE release_id IN ({releaseIds:Array(String)})
				 GROUP BY isrc, effective_from, release_id
				 HAVING argMax(is_deleted, updated_at) = 0`,
				{ releaseIds: chunk },
			);
			if (!existing.length) continue;
			const tombstones: AssetOwnershipSyncRow[] = existing.map((row) => ({
				...row,
				is_deleted: 1,
				updated_at: now,
			}));
			await this.clickHouseService.insertBatched(
				CLICKHOUSE_TABLES.PG_ASSET_OWNERSHIP_SYNC,
				tombstones,
				OWNERSHIP_SYNC_INSERT_BATCH,
			);
		}
	}

	/**
	 * Full rebuild ownership sync. An toan khong "hoi sinh" tombstone: chi chon
	 * DISTINCT release_id con ton tai trong asset_ownership_periods (PG). Release
	 * da bi xoa (va da tombstone o ClickHouse qua tombstoneOwnershipForReleases)
	 * se khong con xuat hien trong ket qua nay, nen khong bao duoc re-sync ve
	 * is_deleted=0.
	 */
	async performFullOwnershipSync(): Promise<void> {
		let offset = 0;
		let syncedReleaseCount = 0;
		while (true) {
			const rows = await this.entityManager.query(
				`SELECT DISTINCT release_id
				 FROM asset_ownership_periods
				 ORDER BY release_id
				 LIMIT $1 OFFSET $2`,
				[INITIAL_SYNC_BATCH_SIZE, offset],
			);
			if (!rows.length) {
				this.logger.log(
					`Asset ownership sync completed: ${syncedReleaseCount} release(s)`,
				);
				return;
			}
			await this.syncOwnershipForReleases(
				rows.map((row: any) => row.release_id),
			);
			syncedReleaseCount += rows.length;
			offset += rows.length;
		}
	}

	// ======================================================
	// CRON: Don dep lich su dong bo cu hon 3 ngay
	// ======================================================

	@Cron(CronExpression.EVERY_DAY_AT_2AM)
	async pruneOldSyncLogs() {
		this.logger.log(
			'Starting cleanup of processed sync logs older than 3 days...',
		);
		try {
			const result = await this.entityManager.query(
				`DELETE FROM clickhouse_sync_outbox
         WHERE processed = true
           AND processed_at < NOW() - INTERVAL '3 days'`,
			);
			const deletedCount = result?.[1] ?? 0;
			this.logger.log(
				`Cleanup complete: removed ${deletedCount} old sync log(s).`,
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
