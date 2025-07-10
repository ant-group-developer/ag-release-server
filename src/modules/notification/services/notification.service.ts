import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './notification.email-service';
import { TelegramService } from './notification.telegram-service';
import { NotificationUserService } from './notification.user-service';

@Injectable()
export class NotificationService {
	constructor(
		private readonly emailService: EmailService,
		private readonly telegramService: TelegramService,
		private readonly configService: ConfigService,
		private readonly notificationUserService: NotificationUserService,
	) {}

	async sendNotificationBackup(data: {
		status: boolean;
		filename: string;
		error?: string;
	}) {
		const { status, filename, error } = data;

		const time = new Date().toLocaleString('vi-VN', {
			timeZone: 'Asia/Ho_Chi_Minh',
		});

		const subject = status
			? `[🟢 BACKUP] Success at ${time}`
			: `[🔴 BACKUP] Failed at ${time}`;

		// const html = renderTemplate(
		// 	status
		// 		? 'src/modules/notification/templates/notification-backup-success.hbs'
		// 		: 'src/modules/notification/templates/notification-backup-fail.hbs',
		// 	{ time, filename, error: error ?? '' },
		// );

		const html = '';

		const listUserDev = await this.notificationUserService.getListUserDev();
		const listEmails: string[] = [];
		const listTelegramIds: string[] = [];

		listUserDev.forEach((user) => {
			listEmails.push(user.email);

			if (user.telegramId) {
				listTelegramIds.push(user.telegramId);
			}
		});

		await this.emailService.sendMessage({
			to: listEmails,
			subject,
			html,
		});

		await this.telegramService.sendMessages({
			telegramIds: listTelegramIds,
			message: html,
		});
	}
}
