// src/modules/sftp-configs/services/sftp-config.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Not, Repository } from 'typeorm';
import { SftpConfigException } from '../const/sftp-config.const';
import {
	CreateSftpConfigDto,
	GetListSftpConfigsDto,
	UpdateSftpConfigDto,
} from '../dto/sftp-config.dto';
import { SftpConfig } from '../entities/sftp-config.entity';
import { SftpConfigQueryService } from './sftp-config.query.service';

@Injectable()
export class SftpConfigsService {
	constructor(
		@InjectRepository(SftpConfig)
		private readonly repo: Repository<SftpConfig>,
		// @InjectRepository(Aggregator)
		// private readonly aggregatorRepo: Repository<Aggregator>,
		private readonly queryService: SftpConfigQueryService,
	) {}

	async getList(filter: GetListSftpConfigsDto) {
		return this.queryService.getList(filter);
	}

	async getDetail(id: string) {
		const entity = await this.repo.findOne({
			where: { id },
			relations: { aggregator: true },
		});
		if (!entity) throw SftpConfigException.NOT_FOUND();
		return entity;
	}

	async upsert({
		data,
		userId,
		manager,
	}: {
		data: CreateSftpConfigDto;
		userId: string;
		manager?: EntityManager;
	}) {
		const repo = this.getDeliverySftpConfigRepo(manager);

		if (data.aggregatorId) {
			const existed = await repo.findOne({
				where: { aggregatorId: data.aggregatorId },
			});
			if (existed) throw SftpConfigException.AGGREGATOR_HAS_CONFIG();
		}

		const entity = repo.create({
			...data,
			creatorId: userId,
			modifierId: userId,
		});

		return repo.save(entity);
	}

	async update({
		id,
		data,
		userId,
	}: {
		id: string;
		data: UpdateSftpConfigDto;
		userId: string;
	}) {
		const entity = await this.repo.findOne({ where: { id } });
		if (!entity) throw SftpConfigException.NOT_FOUND();

		if (data.aggregatorId && data.aggregatorId !== entity.aggregatorId) {
			// const aggregator = await this.aggregatorRepo.findOne({
			// 	where: { id: data.aggregatorId },
			// });
			// if (!aggregator) throw SftpConfigException.AGGREGATOR_NOT_FOUND();

			const existed = await this.repo.findOne({
				where: { aggregatorId: data.aggregatorId, id: Not(id) },
			});
			if (existed) throw SftpConfigException.AGGREGATOR_HAS_CONFIG();
		}

		await this.repo.update(
			{ id },
			{
				...data,
				modifierId: userId,
			},
		);

		return this.getDetail(id);
	}

	async delete({ id, userId }: { id: string; userId: string }) {
		const entity = await this.repo.findOne({ where: { id } });
		if (!entity) throw SftpConfigException.NOT_FOUND();

		await this.repo.update({ id }, { modifierId: userId });
		await this.repo.delete({ id });

		return { id };
	}

	protected getDeliverySftpConfigRepo(manager?: EntityManager) {
		return manager ? manager.getRepository(SftpConfig) : this.repo;
	}
}
