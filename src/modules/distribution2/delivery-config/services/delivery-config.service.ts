// src/modules/distribution/delivery-config/services/delivery-config.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';

import { DeliveryConfigException } from '../const/delivery-config.const';
import {
	CreateDeliveryConfigDto,
	UpdateDeliveryConfigDto,
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

	async create(data: CreateDeliveryConfigDto) {
		await this.validateUnique({ name: data.name });

		const entity = this.repo.create({
			name: data.name,
			providerCode: data.providerCode ?? null,
			sftpHost: data.sftpHost,
			sftpUsername: data.sftpUsername,
			sftpPasswordEncrypted: data.sftpPasswordEncrypted ?? null,
			// remotePath: data.remotePath ?? '/',
			isActive: data.isActive ?? true,
		});

		return this.repo.save(entity);
	}

	async update(id: string, data: UpdateDeliveryConfigDto) {
		const entity = await this.repo.findOne({ where: { id } });
		if (!entity) throw DeliveryConfigException.NOT_FOUND();

		if (data.name && data.name !== entity.name) {
			await this.validateUnique({ name: data.name, ignoreId: id });
		}

		Object.assign(entity, {
			name: data.name ?? entity.name,
			providerCode: data.providerCode ?? entity.providerCode,
			sftpHost: data.sftpHost ?? entity.sftpHost,
			sftpUsername: data.sftpUsername ?? entity.sftpUsername,
			sftpPasswordEncrypted:
				data.sftpPasswordEncrypted ?? entity.sftpPasswordEncrypted,
			// remotePath: data.remotePath ?? entity.remotePath,
			isActive:
				typeof data.isActive === 'boolean'
					? data.isActive
					: entity.isActive,
		});

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
}
