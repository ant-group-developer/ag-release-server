// src/modules/distribution/system-settings/services/system-settings.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemSettingsException } from '../const/system-settings.const';
import {
	GetListSystemSettingsDto,
	UpsertSystemSettingDto,
} from '../dto/system-settings.dto';
import { SystemSetting } from '../entities/system-setting.entity';
import { SystemSettingsQueryService } from './system-settings.query.service';

@Injectable()
export class SystemSettingsService {
	constructor(
		@InjectRepository(SystemSetting)
		private readonly repo: Repository<SystemSetting>,
		private readonly queryService: SystemSettingsQueryService,
	) {}

	async upsert(data: UpsertSystemSettingDto) {
		const entity = await this.repo.findOne({ where: { key: data.key } });
		if (!entity) {
			const created = this.repo.create({
				key: data.key,
				value: data.value ?? null,
				description: data.description ?? null,
			});
			return this.repo.save(created);
		}

		entity.value = data.value ?? entity.value;
		entity.description = data.description ?? entity.description;
		return this.repo.save(entity);
	}

	async delete(key: string) {
		const entity = await this.repo.findOne({ where: { key } });
		if (!entity) throw SystemSettingsException.NOT_FOUND();
		await this.repo.remove(entity);
		return { key };
	}

	async getDetail(key: string) {
		const entity = await this.repo.findOne({ where: { key } });
		if (!entity) throw SystemSettingsException.NOT_FOUND();
		return entity;
	}

	async getList(filter: GetListSystemSettingsDto) {
		return this.queryService.getList(filter);
	}
}
