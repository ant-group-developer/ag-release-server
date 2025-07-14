// schedule.service.ts
import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseBackupService } from '../database/services/database.backup.service';

@Injectable()
export class ScheduleService {
	constructor(
		private readonly databaseBackupService: DatabaseBackupService,
	) {}

	@Cron(CronExpression.EVERY_SECOND)
	handleTest() {
		// console.log('This task runs every second');
		// this.databaseBackupService.exportBackup();
		// this.notificationService.sendNotificationBackup();
	}

	@Cron(CronExpression.EVERY_MINUTE)
	handleCron() {
		console.log('This task runs every minute');
		// this.databaseBackupService.exportBackup();
	}

	@Cron('0 3 * * *')
	async handleDailyTask() {
		console.log('This task runs every day at 3:00 AM');
		await this.databaseBackupService.backup({});
	}

	@Cron('0 10 * * 0')
	handleWeeklyTask() {
		console.log('This task runs every Sunday at 10:00 AM');
	}
}
