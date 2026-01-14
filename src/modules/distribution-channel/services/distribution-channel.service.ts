// services/distribution-channel.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
		private readonly repo: Repository<DistributionChannel>,
		private readonly queryService: DistributionChannelQueryService,
	) {}

	async create(input: {
		data: CreateDistributionChannelDto;
		userId: string;
	}) {
		const { data, userId } = input;

		// await this.validateUnique(data);

		const entity = this.repo.create({
			...data,
			creatorId: userId,
			modifierId: userId,
		});

		return this.repo.save(entity);
	}

	async findOne(id: string) {
		const entity = await this.repo.findOneBy({ id });
		if (!entity) {
			throw DistributionChannelException.NOT_FOUND();
		}
		return entity;
	}

	async update(input: {
		id: string;
		data: UpdateDistributionChannelDto;
		userId: string;
	}) {
		const { id, data, userId } = input;

		await this.findOne(id);
		// await this.validateUnique(data, id);

		await this.repo.update(id, {
			...data,
			modifierId: userId,
		});

		return this.findOne(id);
	}

	async getList(filter: GetListDistributionChannelsDto) {
		return this.queryService.getList(filter);
	}

	async delete(id: string) {
		await this.findOne(id);
		await this.repo.delete(id);
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
}
