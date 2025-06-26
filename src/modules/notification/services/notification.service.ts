import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './notification.email-service';
import { NotificationUserService } from './notification.user-service';

@Injectable()
export class NotificationService {
	constructor(
		private readonly emailService: EmailService,
		// private readonly telegramService: TelegramService,
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

		const html = status
			? `
			<h3>✅ Database Backup Successful</h3>
			<ul>
				<li><b>Time:</b> ${time}</li>
				<li><b>Filename:</b> ${filename}</li>
				<li><b>Upload status:</b> GDrive ✅ & GCS ✅</li>
			</ul>
		`
			: `
			<h3>❌ Database Backup Failed</h3>
			<ul>
				<li><b>Time:</b> ${time}</li>
				<li><b>Filename:</b> ${filename}</li>
			</ul>
			<p><b>Error:</b></p>
			<pre style="background:#eee;padding:10px;">${error}</pre>
		`;

		const listUserDev = await this.notificationUserService.getListUserDev();
		let listEmails: string[] = [];
		let listTelegramIds: string[] = [];

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

		// await this.telegramService.sendMessages({
		// 	telegramIds: listTelegramIds,
		// 	message: html,
		// });
	}
}
