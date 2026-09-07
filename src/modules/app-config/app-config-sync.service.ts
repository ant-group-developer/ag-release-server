import { InjectRedis } from '@nestjs-modules/ioredis';
import {
	Injectable,
	Logger,
	OnModuleDestroy,
	OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { hostname } from 'os';
import { AppConfigService } from './app-config.service';
import {
	APP_CONFIG_CHANGED_CHANNEL,
	APP_CONFIG_EVENT_VERSION,
} from './constants/app-config.constant';
import { AppConfig } from './entities/app-config.entity';
import { AppConfigChangedEvent } from './interfaces/app-config.type';

@Injectable()
export class AppConfigSyncService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(AppConfigSyncService.name);
	private readonly instanceId = `${hostname()}:${process.pid}`;
	private subscriber?: Redis;
	private connectedOnce = false;
	private reloadRunning = false;
	private reloadRequested = false;

	constructor(
		@InjectRedis() private readonly redis: Redis,
		private readonly appConfigService: AppConfigService,
	) {}

	async onModuleInit(): Promise<void> {
		this.subscriber = this.redis.duplicate();

		this.subscriber.on('message', (channel, payload) => {
			void this.handleMessage(channel, payload);
		});

		this.subscriber.on('error', (error: Error) => {
			this.logger.error(`Redis subscriber error: ${error.message}`);
		});

		this.subscriber.on('reconnecting', () => {
			this.logger.warn('Redis subscriber reconnecting');
		});

		this.subscriber.on('ready', () => {
			if (!this.connectedOnce) {
				this.connectedOnce = true;
				return;
			}
			void this.scheduleReload('redis-reconnect');
		});

		await this.subscriber.subscribe(APP_CONFIG_CHANGED_CHANNEL);
	}

	async publishChanged(config: AppConfig): Promise<void> {
		const event: AppConfigChangedEvent = {
			version: APP_CONFIG_EVENT_VERSION,
			eventId: randomUUID(),
			sourceInstanceId: this.instanceId,
			appConfigId: config.id,
			updatedAt: config.updatedAt.toISOString(),
		};

		try {
			await this.redis.publish(
				APP_CONFIG_CHANGED_CHANNEL,
				JSON.stringify(event),
			);
		} catch (error) {
			this.logger.warn(
				`Publish AppConfig event failed: ${(error as Error).message}`,
			);
		}
	}

	private async handleMessage(
		channel: string,
		payload: string,
	): Promise<void> {
		if (channel !== APP_CONFIG_CHANGED_CHANNEL) return;

		try {
			const event = JSON.parse(payload) as Partial<AppConfigChangedEvent>;

			if (
				event.version !== APP_CONFIG_EVENT_VERSION ||
				!event.eventId ||
				!event.sourceInstanceId ||
				!event.appConfigId ||
				!event.updatedAt
			) {
				this.logger.warn('Ignored invalid AppConfig event');
				return;
			}

			if (event.sourceInstanceId === this.instanceId) return;
			await this.scheduleReload('redis-event');
		} catch (error) {
			this.logger.warn(
				`Ignored malformed AppConfig event: ${(error as Error).message}`,
			);
		}
	}

	private async scheduleReload(reason: string): Promise<void> {
		if (this.reloadRunning) {
			this.reloadRequested = true;
			return;
		}

		this.reloadRunning = true;
		try {
			do {
				this.reloadRequested = false;
				await this.appConfigService.reloadFromDatabase();
				this.logger.log(`AppConfig cache reloaded: ${reason}`);
			} while (this.reloadRequested);
		} catch (error) {
			this.logger.error(
				`Reload AppConfig failed: ${(error as Error).message}`,
			);
		} finally {
			this.reloadRunning = false;
		}
	}

	async onModuleDestroy(): Promise<void> {
		if (!this.subscriber) return;
		await this.subscriber
			.unsubscribe(APP_CONFIG_CHANGED_CHANNEL)
			.catch(() => undefined);
		this.subscriber.disconnect();
		this.subscriber = undefined;
	}
}
