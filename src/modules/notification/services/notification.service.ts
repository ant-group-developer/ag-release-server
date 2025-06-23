import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailService } from './notification.email-service';
import { TelegramService } from './notification.telegram-service';

@Injectable()
export class NotificationService {
	constructor(
		private readonly emailService: EmailService,
		private readonly telegramService: TelegramService,
		private readonly configService: ConfigService,
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

		await this.emailService.sendMail({
			to: [this.configService.get<string>('EMAIL_USER')!],
			subject,
			html,
		});
	}
}
