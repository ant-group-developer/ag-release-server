import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import TelegramBot from 'node-telegram-bot-api';
import { ENV } from 'src/common/enums/common';

@Injectable()
export class TelegramService {
	private bot: TelegramBot;

	constructor(private configService: ConfigService) {
		const env = this.configService.get<ENV>('ENV')!;
		const token = this.getToken(env);

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

	private getToken(env: ENV) {
		switch (env) {
			case ENV.LOCAL:
				return this.configService.get<ENV>('TELEGRAM_TOKEN_LOCAL')!;

			case ENV.DEV_TEST:
				return this.configService.get<ENV>('TELEGRAM_TOKEN_DEV_TEST')!;

			case ENV.PRODUCTION:
				return this.configService.get<ENV>(
					'TELEGRAM_TOKEN_PRODUCTION',
				)!;
		}
	}
}
