// services/distribution-channel.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { DistributionChannelException } from '../const/distribution-channel.constant';
import {
	CreateDistributionChannelDto,
	GetListDistributionChannelsDto,
	UpdateDistributionChannelDto,
} from '../dto/distribution-channel.dto';
import { DistributionChannel } from '../entities/distribution-channel.entity';
import { DistributionChannelQueryService } from './distribution-channel-query.service';

@Injectable()
export class DistributionChannelService {
	constructor(
		@InjectRepository(DistributionChannel)
		private readonly distributionChannelRepo: Repository<DistributionChannel>,
		private readonly queryService: DistributionChannelQueryService,
	) {}

	async create(input: {
		data: CreateDistributionChannelDto;
		userId: string;
		tenantId?: string | null;
		manager?: EntityManager;
	}) {
		const { data, userId, manager, tenantId } = input;

		const repo = this.getDistributionChannelRepo(manager);

		// await this.validateUnique(data);

		const entity = repo.create({
			...data,
			tenantId,
			creatorId: userId,
			modifierId: userId,
		});

		if (entity.aggregatorId !== null && entity.isSystemDefault === true) {
			await this.clearSystemDefaultByAggregator({
				aggregatorId: entity.aggregatorId,
				manager,
			});
		}

		return repo.save(entity);
	}

	async bulkCreate({
		data,
		userId,
		manager,
		tenantId,
	}: {
		data: CreateDistributionChannelDto[];
		userId: string;
		manager?: EntityManager;
		tenantId?: string | null;
	}) {
		for (const d of data) {
			await this.create({
				data: d,
				userId,
				manager,
				tenantId,
			});
		}
	}

	async findOne(id: string) {
		const entity = await this.distributionChannelRepo.findOneBy({ id });
		if (!entity) {
			throw DistributionChannelException.NOT_FOUND();
		}
		return entity;
	}

	async update({
		id,
		data,
		userId,
		manager,
	}: {
		id: string;
		data: UpdateDistributionChannelDto;
		userId: string;
		manager?: EntityManager;
	}) {
		const repo = this.getDistributionChannelRepo(manager);

		const { aggregatorId, isSystemDefault } = data;

		await this.findOne(id);
		// await this.validateUnique(data, id);

		if (isSystemDefault && aggregatorId) {
			await this.clearSystemDefaultByAggregator({
				aggregatorId,
				manager,
			});
		}

		await repo.update(id, {
			...data,
			credentials: data.credentials as any,
			modifierId: userId,
		});

		return this.findOne(id);
	}

	async bulkUpdate(
		input: {
			id: string;
			data: UpdateDistributionChannelDto;
			userId: string;
			manager?: EntityManager;
		}[],
	) {
		for (const i of input) {
			await this.update(i);
		}
	}

	async clearSystemDefaultByAggregator({
		aggregatorId,
		manager,
	}: {
		aggregatorId: string;
		manager?: EntityManager;
	}) {
		const repo = this.getDistributionChannelRepo(manager);

		await repo.update({ aggregatorId }, { isSystemDefault: false });
	}

	async getList(filter: GetListDistributionChannelsDto) {
		return this.queryService.getList(filter);
	}

	async delete(id: string) {
		await this.findOne(id);
		await this.distributionChannelRepo.delete(id);
	}

	// private async validateUnique(
	// 	data: Partial<CreateDistributionChannelDto>,
	// 	excludeId?: string,
	// ) {
	// 	if (!data.tenantId || !data.dspId) return;

	// 	const existed = await this.repo.findOne({
	// 		where: {
	// 			tenantId: data.tenantId,
	// 			dspId: data.dspId,
	// 			aggregatorId: data.aggregatorId ?? null,
	// 		},
	// 	});

	// 	if (existed && existed.id !== excludeId) {
	// 		throw DistributionChannelException.DUPLICATED();
	// 	}
	// }

	protected getDistributionChannelRepo(manager?: EntityManager) {
		return manager
			? manager.getRepository(DistributionChannel)
			: this.distributionChannelRepo;
	}
}
