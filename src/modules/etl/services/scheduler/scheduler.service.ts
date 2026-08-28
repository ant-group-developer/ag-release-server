import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { ClickHouseMigrationService } from '../../../clickhouse';
import { ImportJobSourceType } from '../../interfaces';
import { ImportJobsService } from '../import-jobs/import-jobs.service';
import { FtpSyncQueueService } from '../sync/ftp-sync-queue.service';
import { SyncService } from '../sync/sync.service';

@Injectable()
export class SchedulerService implements OnModuleInit {
	private readonly logger = new Logger(SchedulerService.name);

	constructor(
		private readonly syncService: SyncService,
		private readonly importJobsService: ImportJobsService,
		private readonly ftpSyncQueueService: FtpSyncQueueService,
		private readonly schedulerRegistry: SchedulerRegistry,
		private readonly clickHouseMigrationService: ClickHouseMigrationService,
	) {}

	onModuleInit() {
		if (process.env.APP_ROLE !== 'worker') {
			this.logger.debug('Skipping ETL scheduler (not worker role)');
			return;
		}
		this.initializeSchedulerInBackground().catch((err) => {
			this.logger.error(
				`Failed to initialize auto-sync cron: ${err.message}`,
				err.stack,
			);
		});
	}

	private async initializeSchedulerInBackground() {
		await this.clickHouseMigrationService.waitForMigrations();
		try {
			const config = await this.syncService.getSyncConfig();
			if (config.cron) {
				this.logger.log(
					`Initializing auto-sync schedule with cron: ${config.cron}`,
				);
				await this.rescheduleAutoSync(config.cron);
			}
		} catch (err) {
			this.logger.error(
				`Failed to initialize auto-sync cron: ${err.message}`,
				err.stack,
			);
		}
	}

	/** Reschedule the auto-sync cron job dynamically. */
	async rescheduleAutoSync(cronExpr: string): Promise<void> {
		const jobName = 'ftp-auto-sync';
		try {
			const jobs = this.schedulerRegistry.getCronJobs();
			if (jobs.has(jobName)) {
				this.schedulerRegistry.deleteCronJob(jobName);
				this.logger.log(`Deleted existing cron job: ${jobName}`);
			}

			const newJob = new CronJob(
				cronExpr,
				() => {
					this.logger.log(`Executing scheduled auto-sync task...`);
					this.handleAutoSync().catch((err) => {
						this.logger.error(
							`Scheduled auto-sync run failed: ${err.message}`,
							err.stack,
						);
					});
				},
				null,
				false,
				'Asia/Ho_Chi_Minh',
			);

			this.schedulerRegistry.addCronJob(jobName, newJob);
			newJob.start();
			this.logger.log(
				`Rescheduled cron job [${jobName}] to: ${cronExpr}`,
			);
		} catch (err) {
			this.logger.error(
				`Failed to reschedule cron job [${jobName}] with expression "${cronExpr}": ${err.message}`,
			);
		}
	}

	/**
	 * Auto-sync cron job. Runs daily at 2:00 AM by default.
	 * Only executes if sync_mode is 'auto'. Tạo ImportJob row để có audit log.
	 */
	async handleAutoSync() {
		const config = await this.syncService.getSyncConfig();

		if (config.mode !== 'auto') {
			this.logger.debug('Auto-sync skipped (mode is manual)');
			return;
		}

		this.logger.log('Auto-sync triggered by cron...');
		let job: Awaited<ReturnType<ImportJobsService['create']>> | null = null;
		try {
			job = await this.importJobsService.create({
				sourceType: ImportJobSourceType.FTP_AUTO_CRON,
				params: {
					trigger: 'cron',
					cronExpr: config.cron || '0 2 * * *',
				},
			});
			await this.ftpSyncQueueService.pushJob(job.id);
			await this.importJobsService.markQueued(job.id);
			this.logger.log(`Auto-sync job ${job.id} queued for the worker`);
		} catch (err) {
			this.logger.error(`Auto-sync failed: ${err.message}`, err.stack);
			if (job) await this.importJobsService.markFailed(job.id, err);
		}
	}
}
