import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpdateConfigDto } from './app-config.dto';
import { AppConfig } from './app-config.entity';

@Injectable()
export class AppConfigService {
	constructor(
		@InjectRepository(AppConfig)
		private readonly appConfig: Repository<AppConfig>,
	) {}

	async get() {
		return this.appConfig.createQueryBuilder().getOne();
	}

	async update(payload: UpdateConfigDto) {
		const data = await this.get();
		if (data) {
			await this.appConfig.update(data.id, {
				config: payload,
			});
		} else {
			const config = this.appConfig.create({ config: payload });
			await this.appConfig.save(config);
		}
		return this.get();
	}
}
