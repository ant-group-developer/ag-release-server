import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import TelegramBot from 'node-telegram-bot-api';
import { AppEvent } from 'src/common/enums/common';
import { AppConfigService } from 'src/modules/app-config/app-config.service';
import { AppConfigKey } from 'src/modules/app-config/enums/app-config.enum';

@Injectable()
export class TelegramService implements OnModuleInit {
	private readonly logger = new Logger(TelegramService.name);

	private bot: TelegramBot;
	private token: string;
	private chatIdDev: number;

	constructor(private readonly appConfigService: AppConfigService) {}

	onModuleInit() {
		this.reloadConfig();
	}

	@OnEvent(AppEvent.UPDATE_APP_CONFIG)
	handleAppConfigUpdated() {
		this.reloadConfig();
	}

	private reloadConfig() {
		this.stopBotSafe();

		this.token = this.appConfigService.getValue(
			AppConfigKey.TELEGRAM_TOKEN,
		);

		if (this.token) {
			this.bot = new TelegramBot(this.token, { polling: true });

			this.chatIdDev = Number(
				this.appConfigService.getValue(AppConfigKey.CHAT_ID),
			);

			this.applyReplyPing();
			this.sendHelloGroup();
		}
	}

	private sendMessageSafe({
		chatId,
		message,
	}: {
		chatId: number;
		message: string;
	}) {
		this.bot
			.sendMessage(chatId, message)
			.then(() => {
				this.logger.log('Message sent successfully!');
			})
			.catch((error) => {
				this.logger.error('Error sending message:', error);
			});
	}

	private stopBotSafe() {
		if (this.bot) {
			this.bot.stopPolling().catch((_e) => {
				this.logger.error(_e);
			});
		}
	}

	private applyReplyPing() {
		this.bot.onText(/\/start/, (msg) => {
			const chatId = msg.chat.id;
			const telegramId = msg.from?.id;
			this.sendMessageSafe({
				chatId,
				message: `Hello, telegramId: ${telegramId}, chatId: ${chatId}`,
			});
		});
	}

	private sendHelloGroup() {
		if (this.chatIdDev) {
			this.sendMessageSafe({
				chatId: this.chatIdDev,
				message: `Hello, chatId: ${this.chatIdDev}`,
			});
		}
	}

	//
	async sendMessage(telegramId: string, message: string) {
		await this.bot.sendMessage(telegramId, message);
	}

	async sendMessages(data: { telegramIds: string[]; message: string }) {
		const { telegramIds, message } = data;

		for (const telegramId of telegramIds) {
			await this.sendMessage(telegramId, message);
		}
	}

	async sendToDev(message: string) {
		await this.bot.sendMessage(this.chatIdDev, message);
	}
}
