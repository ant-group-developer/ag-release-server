// schedule.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { AppEvent } from 'src/common/enums/common';
import { AppConfigService } from '../app-config/app-config.service';
import { AppConfigKey } from '../app-config/enums/app-config.enum';
import { DatabaseBackupService } from '../database/services/database.backup.service';

@Injectable()
export class ScheduleService implements OnModuleInit {
	private readonly logger = new Logger(ScheduleService.name);
	private cronValue: string;

	constructor(
		private readonly databaseBackupService: DatabaseBackupService,
		private readonly schedulerRegistry: SchedulerRegistry,
		private readonly appConfigService: AppConfigService,
	) {}

	onModuleInit() {
		this.reloadConfig();
	}

	@OnEvent(AppEvent.UPDATE_APP_CONFIG)
	handleAppConfigUpdated() {
		this.reloadConfig();
	}

	private reloadConfig() {
		this.cronValue = this.appConfigService.getValue(
			AppConfigKey.CRON_VALUE,
		);
		this.addJobBackup();
	}

	private addJobBackup() {
		const jobName = 'backup-job';
		this.deleteIfExists({ jobName });

		try {
			const jobBackup = new CronJob(this.cronValue, () => {
				this.logger.log('Start backup');
				this.databaseBackupService.handleCreateSafe();
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

	private deleteIfExists({ jobName }: { jobName: string }) {
		const jobs = this.schedulerRegistry.getCronJobs();
		if (jobs.has(jobName)) {
			this.schedulerRegistry.deleteCronJob(jobName);
			this.logger.log(`Deleted existing cron job: ${jobName}`);
		}
	}
}
