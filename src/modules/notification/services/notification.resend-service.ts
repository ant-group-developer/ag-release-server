import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from 'src/modules/app-config/app-config.service';
import { GetEmailsDto } from '../dtos/get-emails.dto';

@Injectable()
export class NotificationResendService {
	private readonly logger = new Logger(NotificationResendService.name);

	constructor(private readonly appConfigService: AppConfigService) {}

	get config() {
		return this.appConfigService.getValue('config.resend');
	}

	async sendEmail(options: {
		to: string | string[];
		subject: string;
		html: string;
		attachments?: { filename: string; path: string }[];
	}) {
		const { to, subject, html, attachments } = options;
		const { apiKey, email } = this.config || {};
		if (!apiKey || !email) {
			this.logger.warn('Resend email or apiKey is not configured.');
			return false;
		}

		try {
			// Xử lý attachments nếu có để truyền theo chuẩn Resend API
			const formattedAttachments = [];
			if (attachments && attachments.length > 0) {
				const fs = require('fs');
				for (const att of attachments) {
					if (fs.existsSync(att.path)) {
						const content = fs.readFileSync(att.path).toString('base64');
						formattedAttachments.push({
							filename: att.filename,
							content,
						});
					}
				}
			}

			const payload: any = {
				from: email,
				to: Array.isArray(to) ? to : [to],
				subject,
				html,
			};

			if (formattedAttachments.length > 0) {
				payload.attachments = formattedAttachments;
			}

			const response = await fetch('https://api.resend.com/emails', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${apiKey}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(payload),
			});

			if (!response.ok) {
				const errorDetails = await response.text();
				this.logger.error(`Resend API Error: ${errorDetails}`);
				return false;
			}
			
			const data = await response.json();
			this.logger.log(`Email sent successfully via Resend: ${data.id}`);
			return true;
		} catch (error) {
			this.logger.error('Failed to send email via Resend', error);
			return false;
		}
	}

	async getEmails(params?: GetEmailsDto) {
		const { apiKey } = this.config || {};
		if (!apiKey) {
			this.logger.warn('Resend apiKey is not configured.');
			return [];
		}

		try {
			let url = 'https://api.resend.com/emails';
			if (params && Object.keys(params).length > 0) {
				const searchParams = new URLSearchParams();
				const p = params as Record<string, any>;
				for (const key of Object.keys(p)) {
					if (p[key] !== undefined && p[key] !== null && p[key] !== '') {
						searchParams.append(key, String(p[key]));
					}
				}
				const queryString = searchParams.toString();
				if (queryString) {
					url += `?${queryString}`;
				}
			}

			const response = await fetch(url, {
				method: 'GET',
				headers: {
					Authorization: `Bearer ${apiKey}`,
					'Content-Type': 'application/json',
				},
			});

			if (!response.ok) {
				const errorDetails = await response.text();
				this.logger.error(`Resend API Error (getEmails): ${errorDetails}`);
				return [];
			}
			
			const data = await response.json();
			return data.data || [];
		} catch (error) {
			this.logger.error('Failed to get emails via Resend', error);
			return [];
		}
	}
}
