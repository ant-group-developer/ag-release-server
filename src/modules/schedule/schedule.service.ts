// schedule.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { CronJob } from 'cron';
import { AppConfig } from '../app-config/entities/app-config.entity';
import { CopyrightService } from '../copyright/services/copyright.service';
import { DatabaseBackupService } from '../database/services/database.backup.service';

@Injectable()
export class ScheduleService {
	private readonly logger = new Logger(ScheduleService.name);
	private acrCloud: AppConfig['config']['acrCloud'];

	constructor(
		private readonly databaseBackupService: DatabaseBackupService,
		private readonly schedulerRegistry: SchedulerRegistry,
		private readonly copyrightService: CopyrightService,
	) {}

	private addIntervalJob(
		name: string,
		milliseconds: number,
		callback: () => void,
	) {
		const interval = setInterval(callback, milliseconds);
		this.schedulerRegistry.addInterval(name, interval);
		this.logger.log(
			`Added interval job: ${name}, every ${milliseconds} ms`,
		);
	}

	private addCronJob(name: string, cronTime: string, callback: () => void) {
		const job = new CronJob(cronTime, callback);
		this.schedulerRegistry.addCronJob(name, job);
		job.start();
		this.logger.log(`Added cron job: ${name}, cron time: ${cronTime}`);
	}

	handleScheduleArc() {
		const acrCloud = this.acrCloud;
		if (acrCloud.autoScan) {
			const trackIds = this.getListTrackIdsNeedScan();

			if (acrCloud.autoScanTime1) {
				if (acrCloud.autoScanTime1.type === 'interval') {
					this.addIntervalJob('jobArc', 0, () => {
						return trackIds.map((item) => {
							return this.copyrightService.scanTrackCopyright(
								item,
							);
						});
					});
				} else if (acrCloud.autoScanTime1.type === 'cron') {
					this.addCronJob(
						'jobArc',
						acrCloud.autoScanTime1.value,
						() => {
							return trackIds.map((item) => {
								return this.copyrightService.scanTrackCopyright(
									item,
								);
							});
						},
					);
					this.copyrightService.scanTrackCopyright('');
				}
			}
		}
	}

	getListTrackIdsNeedScan() {
		return ['', ''];
	}
}
