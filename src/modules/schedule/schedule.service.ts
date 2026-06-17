// schedule.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { AppEvent } from 'src/common/enums/common';
import { AppConfigService } from '../app-config/app-config.service';
import { DatabaseBackupService } from '../database/services/database.backup.service';
import { ReleaseExecution3CronJobService } from '../release/modules/release-executions3/services/release-execution3.cron-job.service';

@Injectable()
export class ScheduleService implements OnModuleInit {
	private readonly logger = new Logger(ScheduleService.name);

	constructor(
		private readonly databaseBackupService: DatabaseBackupService,
		private readonly schedulerRegistry: SchedulerRegistry,
		private readonly appConfigService: AppConfigService,

		private readonly releaseExecution3CronJobService: ReleaseExecution3CronJobService,
	) {}

	onModuleInit() {
		this.reloadConfig();
	}

	@OnEvent(AppEvent.UPDATE_APP_CONFIG)
	handleAppConfigUpdated() {
		this.reloadConfig();
	}

	private reloadConfig() {
		this.addJobBackup();
		this.addJobCiDailySend();
	}

	private addJobBackup() {
		const jobName = 'backup-job';
		this.deleteIfExists({ jobName });

		try {
			const { enable, cronValue } =
				this.appConfigService.cache.config.backupDatabase;
			if (!enable) {
				this.logger.log('Backup database is disabled');
				return;
			}
			const jobBackup = new CronJob(cronValue, () => {
				this.logger.log('Start backup');
				this.databaseBackupService.eventBackup().catch((_e) => {
					this.logger.log(_e.message);
				});
			});

			this.schedulerRegistry.addCronJob(jobName, jobBackup);
			jobBackup.start();
			this.logger.log(`Added cron job: ${jobName}`);
		} catch (err) {
			this.logger.error(
				` Failed to create cron job [${jobName}]: ${(err as Error).message}`,
			);
		}
	}

	private addJobCiDailySend() {
		const jobName = 'ci-daily-send-v3';
		this.deleteIfExists({ jobName });

		try {
			const cronValue =
				this.appConfigService.cache?.config?.partners?.ci
					?.dailySendCron || '0 8 * * *';

			const job = new CronJob(cronValue, () => {
				this.releaseExecution3CronJobService
					.handleDailySend()
					.catch((err) => {
						this.logger.error(
							`[CRON] Daily CI send failed: ${err.message}`,
						);
					});
			});

			this.schedulerRegistry.addCronJob(jobName, job);
			job.start();
			this.logger.log(
				`Added cron job: ${jobName} with expression: ${cronValue}`,
			);
		} catch (err) {
			this.logger.error(
				`Failed to create cron job [${jobName}]: ${(err as Error).message}`,
			);
		}
	}

	private deleteIfExists({ jobName }: { jobName: string }) {
		const jobs = this.schedulerRegistry.getCronJobs();
		if (jobs.has(jobName)) {
			this.schedulerRegistry.deleteCronJob(jobName);
			this.logger.log(`Deleted existing cron job: ${jobName}`);
		}
	}

	// lấy ra các bản ghi đang ở WAITING_PARTNER đã tới giờ xử lí, worker sẽ update trạng thái
	// @Cron('* * * * * *') // 1s
	// @Cron('*/10 * * * * *') // 10s
	// @Cron('*/3 * * * *') // 3 phut
	// @Cron('* * * * *') // mỗi 1 phút
	@Cron('* * * * *') // mỗi 1 phút
	async resumeWaitingSteps() {
		await this.releaseExecution3CronJobService.resumeWaitingSteps();
	}

	/**
	 * Cron check CI Tool job status bên tool ci.
	 * Chạy mỗi phút, nhưng chỉ check job nào đã tới nextCiToolCheckAt.
	 */
	@Cron('*/10 * * * * *') // mỗi 10 giây
	async checkCiToolJobStatus() {
		await this.releaseExecution3CronJobService.checkCiToolJobStatus();
	}

	@Cron('*/10 * * * * *') // mỗi 10 giây
	async consumeReleaseExecutions3() {
		await this.releaseExecution3CronJobService.consumeExecutions();
	}

	@Cron('*/10 * * * * *') // mỗi 10 giây
	async consumeReleaseExecution3RunPipelineQueue() {
		await this.releaseExecution3CronJobService.consumeRunPipelineQueue();
	}
}
