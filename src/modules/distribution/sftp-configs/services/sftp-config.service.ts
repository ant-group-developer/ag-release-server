// src/modules/sftp-configs/services/sftp-config.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { decryptSecretSafe, encryptSecret } from 'src/utils/util.encrypt';
import { EntityManager, Not, Repository } from 'typeorm';
import { SftpConfigException } from '../const/sftp-config.const';
import {
	CreateSftpConfigDto,
	GetListSftpConfigsDto,
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
				where: {
					aggregatorId: data.aggregatorId,
					...(data.id ? { id: Not(data.id) } : {}),
				},
			});
			if (existed) throw SftpConfigException.AGGREGATOR_HAS_CONFIG();
		}

		if (data.metadata?.password)
			data.metadata.password = encryptSecret(data.metadata?.password);

		if (data.metadata?.privateKey)
			data.metadata.privateKey = encryptSecret(data.metadata?.privateKey);

		const entity = repo.create({
			...data,
			creatorId: userId,
			modifierId: userId,
		});

		return repo.save(entity);
	}

	async getList(filter: GetListSftpConfigsDto) {
		const result = await this.queryService.getList(filter);
		this.decryptSecretEntityList(result.items);
		return result;
	}

	async getDetail(id: string) {
		const entity = await this.repo.findOne({
			where: { id },
			relations: { aggregator: true },
		});
		if (!entity) throw SftpConfigException.NOT_FOUND();
		this.decryptSecretEntity(entity);
		return entity;
	}

	// async update({
	// 	id,
	// 	data,
	// 	userId,
	// }: {
	// 	id: string;
	// 	data: UpdateSftpConfigDto;
	// 	userId: string;
	// }) {
	// 	const entity = await this.repo.findOne({ where: { id } });
	// 	if (!entity) throw SftpConfigException.NOT_FOUND();

	// 	if (data.aggregatorId && data.aggregatorId !== entity.aggregatorId) {
	// 		// const aggregator = await this.aggregatorRepo.findOne({
	// 		// 	where: { id: data.aggregatorId },
	// 		// });
	// 		// if (!aggregator) throw SftpConfigException.AGGREGATOR_NOT_FOUND();

	// 		const existed = await this.repo.findOne({
	// 			where: { aggregatorId: data.aggregatorId, id: Not(id) },
	// 		});
	// 		if (existed) throw SftpConfigException.AGGREGATOR_HAS_CONFIG();
	// 	}

	// 	await this.repo.update(
	// 		{ id },
	// 		{
	// 			...data,
	// 			modifierId: userId,
	// 		},
	// 	);

	// 	return this.getDetail(id);
	// }

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

	// private
	private decryptSecretEntity(e: SftpConfig) {
		if (e.metadata?.password)
			e.metadata.password = decryptSecretSafe(e.metadata.password);

		if (e.metadata?.privateKey)
			e.metadata.privateKey = decryptSecretSafe(e.metadata.privateKey);
	}
	private decryptSecretEntityList(listE: SftpConfig[]) {
		listE.map((e) => this.decryptSecretEntity(e));
	}
}
