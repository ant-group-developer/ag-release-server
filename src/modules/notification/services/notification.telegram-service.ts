import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import TelegramBot from 'node-telegram-bot-api';

@Injectable()
export class TelegramService {
	private bot: TelegramBot;

	constructor(private configService: ConfigService) {
		const token = this.configService.get<string>('TELEGRAM_TOKEN')!;

		this.bot = new TelegramBot(token, { polling: true });
	}

	async sendMessage(telegramId: string, message: string) {
		try {
			await this.bot.sendMessage(telegramId, message);
		} catch (error) {
			throw error;
		}
	}

	async sendMessages(data: { telegramIds: string[]; message: string }) {
		const { telegramIds, message } = data;

		for (const telegramId of telegramIds) {
			await this.sendMessage(telegramId, message);
		}
	}
}
