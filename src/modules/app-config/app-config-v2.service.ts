import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { AppEvent } from 'src/common/enums/common';
import { Repository } from 'typeorm';
import { appConfigDefault } from './constants/app-config.constant';
import { UpdateConfigDto } from './dtos/app-config.dto';
import { AppConfig } from './entities/app-config.entity';
import { AppConfigKey2 } from './enums/app-config.enum';

@Injectable()
export class AppConfigService2 implements OnModuleInit {
	private readonly logger = new Logger(AppConfigService2.name);

	private cache?: AppConfig;

	constructor(
		@InjectRepository(AppConfig)
		private readonly appConfigRepo: Repository<AppConfig>,
		private readonly eventEmitter: EventEmitter2,
	) {}

	getCache(): AppConfig {
		if (!this.cache) {
			this.refreshCache().catch((_e) => {});
		}

		return (
			this.cache ?? ({ id: '', config: appConfigDefault } as AppConfig)
		);
	}

	getValue<T = any>(path: string | AppConfigKey2): T | undefined {
		const r = this.getCache();

		return path.split('.').reduce<any>((acc, key) => {
			return acc?.[key];
		}, r);
	}

	getPublic() {
		const website = this.getValue('config.website');
		const chunkDuration = this.getValue('config.acrCloud.chunkDuration');
		const general = this.getValue('config.general');

		return {
			config: {
				website,
				acrCloud: {
					chunkDuration,
				},

				general,
			},
		};
	}

	async update(payload: UpdateConfigDto) {
		const { website } = payload;

		const dataDb = this.getCache();

		const { config: configDb } = dataDb;

		const { website: websiteDb } = configDb;

		if (website?.logo !== undefined) {
			if (website.logo === null) {
				if (websiteDb.logo) {
					this.eventEmitter.emit(
						AppEvent.DELETE_LOGO,
						websiteDb.logo,
					);
				}
			}
		} else if (website) {
			website.logo = websiteDb.logo;
		}

		// const
		const e = { ...dataDb, config: { ...dataDb.config, ...payload } };

		const result = await this.appConfigRepo.save(e);

		this.setCache(result);

		return result;
	}

	// private
	async onModuleInit() {
		await this.refreshCache();
	}

	private setCache(r: AppConfig) {
		this.cache = r;
	}

	private async refreshCache() {
		let appConfig = await this.findOneDb();

		if (!appConfig) {
			this.logger.log('Initializing default AppConfig');
			const entity = this.appConfigRepo.create({
				config: appConfigDefault,
			});
			appConfig = await this.appConfigRepo.save(entity);
		}

		this.setCache(appConfig);

		return appConfig;
	}

	private async findOneDb() {
		return this.appConfigRepo.createQueryBuilder().getOne();
	}

	private emitEventUpdate() {
		this.logger.log(`Event: ${AppEvent.UPDATE_APP_CONFIG}}`);
		this.eventEmitter.emit(AppEvent.UPDATE_APP_CONFIG);
	}
}
