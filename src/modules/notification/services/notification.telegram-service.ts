import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import TelegramBot from 'node-telegram-bot-api';

@Injectable()
export class TelegramService {
	private bot: TelegramBot;

	constructor(private configService: ConfigService) {
		const token = this.configService.get<string>('TELEGRAM_TOKEN')!;

		this.bot = new TelegramBot(token, { polling: true });

		this.bot.onText(/\/start/, (msg) => {
			const chatId = msg.chat.id;
			const telegramId = msg.from?.id;

			this.bot
				.sendMessage(chatId, `Hello, your telegram Id is ${telegramId}`)
				.then(() => {
					console.log('Message sent successfully!');
				})
				.catch((error) => {
					console.error('Error sending message:', error);
				});
		});
	}

	async sendMessage(telegramId: string, message: string) {
		await this.bot.sendMessage(telegramId, message);
	}

	async sendMessages(data: { telegramIds: string[]; message: string }) {
		const { telegramIds, message } = data;

		for (const telegramId of telegramIds) {
			await this.sendMessage(telegramId, message);
		}
	}
}
