import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReleaseExecutionConfig } from '../entites/release-execution-config.entity';
import { ReleaseExecutionStepType } from '../enums/release-execution3.enum';

export const EXECUTION_CONFIG_EVENT = 'UPDATE_EXECUTION_CONFIG';

@Injectable()
export class ReleaseExecutionConfigService implements OnModuleInit {
	private cache: ReleaseExecutionConfig;

	constructor(
		@InjectRepository(ReleaseExecutionConfig)
		private readonly configRepo: Repository<ReleaseExecutionConfig>,
		private readonly eventEmitter: EventEmitter2,
	) {}

	async onModuleInit() {
		await this.refreshCleanupConfig();
	}

	getCleanupConfig(): ReleaseExecutionConfig {
		return this.cache;
	}

	async updateConfig(
		cronValue: string,
		stepConfigs: Array<{
			stepType: ReleaseExecutionStepType;
			timeoutMinutes: number;
		}>,
	) {
		const config = this.cache;
		config.cleanupCronValue = cronValue;
		config.stepConfigs = stepConfigs;

		await this.configRepo.save(config);
		this.cache = config;

		this.eventEmitter.emit(EXECUTION_CONFIG_EVENT);
	}

	private async refreshCleanupConfig() {
		let config = await this.configRepo.createQueryBuilder().getOne();

		if (!config) {
			config = this.configRepo.create({
				cleanupCronValue: '0 * * * *',
				stepConfigs: [
					{
						stepType:
							ReleaseExecutionStepType.CREATE_METADATA_ON_SERVER,
						timeoutMinutes: 3 * 24 * 60,
					},
					{
						stepType:
							ReleaseExecutionStepType.UPLOAD_METADATA_TO_SFTP,
						timeoutMinutes: 3 * 24 * 60,
					},
				],
			});

			await this.configRepo.save(config);
		}

		this.cache = config;
	}
}
