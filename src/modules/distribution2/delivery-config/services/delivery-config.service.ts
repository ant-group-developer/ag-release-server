// src/modules/distribution/delivery-config/services/delivery-config.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Not, Repository } from 'typeorm';

import { DeliveryConfigException } from '../const/delivery-config.const';
import {
	CreateDeliveryConfigDto,
	UpdateDeliveryConfigDto,
	UpsertDeliveryConfigDto,
} from '../dto/delivery-config.dto';
import { DeliveryConfig } from '../entities/delivery-config.entity';
import { DeliveryConfigQueryService } from './delivery-config.query.service';

@Injectable()
export class DeliveryConfigService {
	constructor(
		@InjectRepository(DeliveryConfig)
		private readonly repo: Repository<DeliveryConfig>,
		private readonly queryService: DeliveryConfigQueryService,
	) {}

	async upsert({
		data,
		manager,
	}: {
		data: UpsertDeliveryConfigDto;
		manager?: EntityManager;
	}) {
		const repo = this.getDeliveryConfigRepo(manager);
		const e = repo.create(data);

		await this.validateUnique({ name: e.name });

		return await this.repo.save(e);
	}

	async bulkUpsert(data: UpsertDeliveryConfigDto[]) {
		await this.repo.save(data);
	}

	async create(data: CreateDeliveryConfigDto) {
		await this.validateUnique({ name: data.name });

		const entity = this.repo.create(data);

		return this.repo.save(entity);
	}

	async update(id: string, data: UpdateDeliveryConfigDto) {
		const entity = await this.repo.findOne({ where: { id } });
		if (!entity) throw DeliveryConfigException.NOT_FOUND();

		if (data.name && data.name !== entity.name) {
			await this.validateUnique({ name: data.name, ignoreId: id });
		}

		Object.assign(entity, data);

		return this.repo.save(entity);
	}

	async delete(id: string) {
		const entity = await this.repo.findOne({ where: { id } });
		if (!entity) throw DeliveryConfigException.NOT_FOUND();
		await this.repo.remove(entity);
		return { id };
	}

	async getDetail(id: string) {
		const entity = await this.repo.findOne({ where: { id } });
		if (!entity) throw DeliveryConfigException.NOT_FOUND();
		return entity;
	}

	async getList(filter: any) {
		return this.queryService.getList(filter);
	}

	private async validateUnique({
		name,
		ignoreId,
	}: {
		name: string;
		ignoreId?: string;
	}) {
		const existed = await this.repo.findOne({
			where: ignoreId ? { name, id: Not(ignoreId) } : { name },
		});
		if (existed) throw DeliveryConfigException.NAME_EXISTED();
	}

	protected getDeliveryConfigRepo(manager?: EntityManager) {
		return manager ? manager.getRepository(DeliveryConfig) : this.repo;
	}
}
