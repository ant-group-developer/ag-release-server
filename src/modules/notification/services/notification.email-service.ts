// src/notification/email.provider.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
	private transporter;

	constructor(private configService: ConfigService) {
		this.transporter = nodemailer.createTransport({
			service: this.configService.get<string>('EMAIL_SERVICE', 'gmail'),
			auth: {
				user: this.configService.get<string>('EMAIL_USER'),
				pass: this.configService.get<string>('EMAIL_PASS'),
			},
		});
	}

	async sendMessage(data: { to: string[]; subject: string; html: string }) {
		const { to, subject, html } = data;

		try {
			await this.transporter.sendMail({
				to,
				subject,
				html,
			});
		} catch (error) {
			throw error;
		}
	}
}
