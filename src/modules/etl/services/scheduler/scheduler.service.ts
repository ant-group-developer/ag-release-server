import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { isWorker } from 'src/common/constants/app-role';
import { ClickHouseMigrationService } from '../../../clickhouse';
import { ImportJobSourceType } from '../../interfaces';
import { ImportJobsService } from '../import-jobs/import-jobs.service';
import { SyncService } from '../sync/sync.service';

@Injectable()
export class SchedulerService implements OnModuleInit {
	private readonly logger = new Logger(SchedulerService.name);

	constructor(
		private readonly syncService: SyncService,
		private readonly importJobsService: ImportJobsService,
		private readonly schedulerRegistry: SchedulerRegistry,
		private readonly clickHouseMigrationService: ClickHouseMigrationService,
	) {}

	onModuleInit() {
		if (!isWorker()) {
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

	/**
	 * Reschedule the auto-sync cron job dynamically.
	 */
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

		const job = await this.importJobsService.create({
			sourceType: ImportJobSourceType.FTP_AUTO_CRON,
			params: { trigger: 'cron', cronExpr: config.cron || '0 2 * * *' },
		});

		try {
			await this.importJobsService.markProcessing(job.id);
			const results = await this.syncService.syncAll(false);
			const totalRows = results.reduce(
				(sum, r) => sum + (r.totalRows ?? 0),
				0,
			);
			const totalPeriods = results.length;

			this.logger.log(
				`Auto-sync complete: ${totalPeriods} periods, ${totalRows} total rows`,
			);

			await this.importJobsService.markCompleted(job.id, {
				totalPeriods,
				totalRows,
				results,
			});
		} catch (err) {
			this.logger.error(`Auto-sync failed: ${err.message}`, err.stack);
			await this.importJobsService.markFailed(job.id, err);
		}
	}
}
