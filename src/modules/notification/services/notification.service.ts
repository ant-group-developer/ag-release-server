import { Injectable } from '@nestjs/common';
import { htmlToText } from 'html-to-text';
import { renderTemplate } from 'src/utils/util';
import { EmailService } from './notification.email-service';
import { TelegramService } from './notification.telegram-service';
import { NotificationUserService } from './notification.user-service';

@Injectable()
export class NotificationService {
	private PATH_TEMPLATES: string;

	constructor(
		private readonly emailService: EmailService,
		private readonly telegramService: TelegramService,
		// private readonly configService: ConfigService,
		private readonly notificationUserService: NotificationUserService,
	) {
		this.PATH_TEMPLATES = './src/modules/notification/templates';
	}

	async sendNotificationBackupSuccess(data: { filename: string }) {
		const { filename } = data;

		const time = new Date().toLocaleString('vi-VN', {
			timeZone: 'Asia/Ho_Chi_Minh',
		});

		const subject = `[🟢 BACKUP] Success at ${time}`;

		const html = renderTemplate(
			`${this.PATH_TEMPLATES}/backup-success.hbs`,
			{ time, filename },
		);

		await this.sendToDev(subject, html);
	}

	async sendNotificationBackupFail(data: {
		filename: string;
		error: string;
	}) {
		const { filename, error } = data;

		const time = new Date().toLocaleString('vi-VN', {
			timeZone: 'Asia/Ho_Chi_Minh',
		});

		const subject = `[🔴 BACKUP] Failed at ${time}`;

		const html = renderTemplate(`${this.PATH_TEMPLATES}/backup-fail.hbs`, {
			time,
			filename,
			error: error ?? '',
		});

		await this.sendToDev(subject, html);
	}

	async sendToDev(subject: string, html: string) {
		const listUserDev = await this.notificationUserService.getListUserDev();
		const listEmails: string[] = [];
		const listTelegramIds: string[] = [];

		if (listUserDev.length > 0) {
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
				message: htmlToText(html),
			});
		}
	}
}
