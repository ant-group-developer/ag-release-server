import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { AppEvent } from 'src/common/enums/common';
import { Repository } from 'typeorm';
import { appConfigDefault } from './constants/app-config.constant';
import { UpdateConfigDto } from './dtos/app-config.dto';
import { AppConfig } from './entities/app-config.entity';
import { AppConfigKey } from './enums/app-config.enum';
import {
	AppConfigShape,
	AppConfigValueMap,
} from './interfaces/app-config.type';

@Injectable()
export class AppConfigService implements OnModuleInit {
	private readonly logger = new Logger(AppConfigService.name);
	private id: string;
	private config: AppConfigShape;

	constructor(
		@InjectRepository(AppConfig)
		private readonly appConfigRepo: Repository<AppConfig>,
		private readonly eventEmitter: EventEmitter2,
	) {}

	async onModuleInit() {
		const result = await this.initDataDefault();
		this.id = result.id;
		this.config = result.config;
	}

	private async initDataDefault() {
		const appConfig = await this.findOne();

		if (!appConfig) {
			this.logger.log('Initializing default AppConfig');
			const entity = this.appConfigRepo.create({
				config: appConfigDefault,
			});
			return this.appConfigRepo.save(entity);
		}

		this.logger.log('AppConfig already exists, skipping initialization.');
		return appConfig;
	}

	private emitEventUpdate() {
		this.logger.log(`Event: ${AppEvent.UPDATE_APP_CONFIG}}`);
		this.eventEmitter.emit(AppEvent.UPDATE_APP_CONFIG);
	}

	private async findOne() {
		return this.appConfigRepo.createQueryBuilder().getOne();
	}

	private async getOneOrCreate(): Promise<AppConfig> {
		const result = new AppConfig();
		result.id = this.id;
		result.config = this.config;

		if (!result || !result.config) {
			return this.initDataDefault();
		}

		return result;
	}

	async update(payload: UpdateConfigDto) {
		const { website } = payload;

		const dataDb = await this.getOneOrCreate();

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
		const result = await this.appConfigRepo.save({ ...dataDb, ...payload });

		this.config = result.config;
		this.emitEventUpdate();
		return this.config;
	}

	getPublic() {
		const website = this.getValue(AppConfigKey.WEBSITE);
		const chunkDuration = this.getValue(AppConfigKey.CHUNK_DURATION);
		const general = this.getValue(AppConfigKey.GENERAL);

		return {
			website,
			acrCloud: {
				chunkDuration,
			},

			general,
		};
	}

	getValue<K extends AppConfigKey>(key: K): AppConfigValueMap[K] {
		const {
			acrCloud,
			telegram,
			website,
			backupDatabase,
			general,
			generator,
		} = this.config;

		const values: AppConfigValueMap = {
			[AppConfigKey.ALL]: this.config,

			[AppConfigKey.WEBSITE]: website,
			[AppConfigKey.ACR_HOST]: acrCloud.acrHost,
			[AppConfigKey.ACR_ACCESS_KEY]: acrCloud.acrAccessKey,
			[AppConfigKey.ACR_ACCESS_SECRET]: acrCloud.acrAccessSecret,
			[AppConfigKey.CHUNK_DURATION]: acrCloud.chunkDuration,
			[AppConfigKey.SCORE_WARNING]: acrCloud.scoreWarning,

			// backup
			[AppConfigKey.CRON_VALUE]: backupDatabase.cronValue,
			[AppConfigKey.FILE_NAME]: backupDatabase.fileName,
			[AppConfigKey.SHELL]: backupDatabase.shell,

			[AppConfigKey.DATABASE_TO_DRIVE]: backupDatabase.toDrive,
			[AppConfigKey.DATABASE_TO_GCS]: backupDatabase.toGcs,
			[AppConfigKey.NOTIFY_ON_SUCCESS]: backupDatabase.notifyOnSuccess,
			[AppConfigKey.NOTIFY_ON_FAILED]: backupDatabase.notifyOnFailed,

			// telegram
			[AppConfigKey.TELEGRAM_TOKEN]: telegram.token,
			[AppConfigKey.CHAT_ID]: telegram.chatId,

			// track
			[AppConfigKey.GENERAL]: general,
			[AppConfigKey.generator]: generator,
		};

		return values[key];
	}

	// get value
	async getPrefixIsrcDefaultId() {
		const r = await this.getOneOrCreate();
		return r.config.generator.prefixIsrcDefaultId;
	}

	async getPrefixUpcDefaultId() {
		const r = await this.getOneOrCreate();
		return r.config.generator.prefixUpcDefaultId;
	}

	async getDdexPartyIdSender() {
		try {
			const r = await this.getOneOrCreate();
			return r.config.generator.DDEX_PARTY_ID_SENDER;
		} catch (error) {
			return '';
		}
	}

	async getDdexPartyNameSender() {
		try {
			const r = await this.getOneOrCreate();
			return r.config.generator.DDEX_PARTY_NAME_SENDER;
		} catch (error) {
			return '';
		}
	}

	async getAPI_KEY_GRPC_ISRC_UPC() {
		try {
			const r = await this.getOneOrCreate();
			return r.config.generator.API_KEY_GRPC_ISRC_UPC;
		} catch (error) {
			return '';
		}
	}
}
