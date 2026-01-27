// aggregator.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { newTransaction } from 'src/utils/utils.transaction';
import { EntityManager, Not, Repository } from 'typeorm';
import { AggregatorException } from '../const/aggregator.constant';
import {
	CreateAggregatorDto,
	GetListAggregatorsDto,
	UpdateAggregatorDto,
} from '../dto/aggregator.dto';
import { Aggregator } from '../entities/aggregator.entity';
import { AggregatorQueryService } from './aggregator-query.service';
import { DistributionChannelService } from './distribution-channel.service';

@Injectable()
export class AggregatorService {
	constructor(
		@InjectRepository(Aggregator)
		private readonly aggregatorRepo: Repository<Aggregator>,

		private readonly aggregatorQueryService: AggregatorQueryService,
		private readonly distributionChannelService: DistributionChannelService,
	) {}

	async create({
		data,
		userId,
		tenantId,
	}: {
		data: CreateAggregatorDto;
		userId: string;
		tenantId?: string | null;
	}) {
		const { distributionChannel, ...rest } = data;

		await this.validateUnique({
			code: data.code,
			name: data.name,
		});

		const entity = this.aggregatorRepo.create({
			...rest,
			creatorId: userId,
			modifierId: userId,
		});

		const queryRunner = await newTransaction(this.aggregatorRepo);

		try {
			const { manager } = queryRunner;
			const repo = manager.getRepository(Aggregator);

			const aggregator = await repo.save(entity);
			if (distributionChannel !== undefined) {
				await this.distributionChannelService.create({
					data: {
						...distributionChannel,
						aggregatorId: aggregator.id,
					},
					userId,
					manager,
					tenantId,
				});
			}

			if (entity.isSystemDefault) {
				await this.resetSystemDefault({ id: entity.id, manager });
			}

			await queryRunner.commitTransaction();

			return this.findOne(aggregator.id);
		} catch (e) {
			await queryRunner.rollbackTransaction();
			throw e;
		} finally {
			await queryRunner.release();
		}
	}

	async findOne(id: string) {
		const entity = await this.aggregatorRepo.findOne({
			where: { id },
			relations: { distributionChannel: true },
		});
		if (!entity) {
			throw AggregatorException.NOT_FOUND();
		}
		return entity;
	}

	async update({
		id,
		data,
		userId,
	}: {
		id: string;
		data: UpdateAggregatorDto;
		userId: string;
	}) {
		const { distributionChannel, ...rest } = data;

		// ensure exists
		await this.findOne(id);

		// validate unique (ignore current record)
		await this.validateUnique({
			code: data.code,
			name: data.name,
			excludeId: id,
		});

		const transaction = await newTransaction(this.aggregatorRepo);

		try {
			const { manager } = transaction;
			const repo = manager.getRepository(Aggregator);

			await repo.update(id, {
				...rest,
				modifierId: userId,
			});

			if (
				distributionChannel !== undefined &&
				distributionChannel.id !== undefined
			) {
				await this.distributionChannelService.update({
					id: distributionChannel.id,
					data: {
						aggregatorId: distributionChannel.aggregatorId,
						credentials: distributionChannel.credentials,
						// isActive: distributionChannel.isActive,
					},
					userId,
					manager,
				});
			}

			if (rest.isSystemDefault) {
				await this.resetSystemDefault({ id, manager });
			}
			return await this.findOne(id);
		} catch (error) {
			await transaction.rollbackTransaction();
			throw error;
		} finally {
			await transaction.release();
		}
	}

	async getList(filter: GetListAggregatorsDto) {
		const data = await this.aggregatorQueryService.getList(filter);

		return data;
	}

	async delete(id: string) {
		await this.aggregatorRepo.delete(id);
	}

	private async validateUnique({
		code,
		name,
		excludeId,
	}: {
		code?: string;
		name?: string;
		excludeId?: string;
	}) {
		// validate code
		if (code) {
			const existedByCode = await this.aggregatorRepo.findOne({
				where: {
					code,
					...(excludeId ? { id: Not(excludeId) } : {}),
				},
			});

			if (existedByCode) {
				throw AggregatorException.CODE_EXISTED();
			}
		}

		// validate name
		if (name) {
			const existedByName = await this.aggregatorRepo.findOne({
				where: {
					name,
					...(excludeId ? { id: Not(excludeId) } : {}),
				},
			});

			if (existedByName) {
				throw AggregatorException.NAME_EXISTED();
			}
		}
	}

	async resetSystemDefault({
		id,
		manager,
	}: {
		id: string;
		manager?: EntityManager;
	}) {
		const repo = this.getAggregatorRepo(manager);

		await repo.update(
			{ isSystemDefault: true },
			{ isSystemDefault: false },
		);
		await repo.update({ id }, { isSystemDefault: true });
	}

	protected getAggregatorRepo(manager?: EntityManager) {
		return manager
			? manager.getRepository(Aggregator)
			: this.aggregatorRepo;
	}
}
