import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import TelegramBot from 'node-telegram-bot-api';
import { AppEvent } from 'src/common/enums/common';
import { AppConfigService } from 'src/modules/app-config/app-config.service';

@Injectable()
export class TelegramService implements OnModuleInit {
	private readonly logger = new Logger(TelegramService.name);
	private bot: TelegramBot;

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
		this.newBot();
	}

	private sendMessageSafe({
		chatId,
		message,
	}: {
		chatId: number;
		message: string;
	}) {
		this.bot.sendMessage(chatId, message).catch((error) => {
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

	private newBot() {
		const token = this.appConfigService.cache.config.telegram.token;

		if (token) {
			this.bot = new TelegramBot(token);

			this.applyReplyPing();
			this.sendHelloGroup();
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
		const chatIdDev = this.appConfigService.cache.config.telegram.chatId;
		if (chatIdDev) {
			this.sendMessageSafe({
				chatId: Number(chatIdDev),
				message: `Hello, chatId: ${chatIdDev}`,
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
		await this.bot.sendMessage(
			this.appConfigService.cache.config.telegram.chatId,
			message,
		);
	}
}
