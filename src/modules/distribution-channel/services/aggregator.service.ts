// aggregator.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { newTransaction } from 'src/utils/utils.transaction';
import { Not, Repository } from 'typeorm';
import { AggregatorException } from '../const/aggregator.constant';
import { DistributionChannelException } from '../const/distribution-channel.constant';
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
		const { distributionChannels, ...rest } = data;

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
			if (distributionChannels !== undefined) {
				distributionChannels.map(
					(d) => (d.aggregatorId = aggregator.id),
				);

				await this.distributionChannelService.bulkCreate({
					data: distributionChannels,
					userId,
					manager,
					tenantId,
				});
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
			relations: { distributionChannels: true },
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
		const { distributionChannels, ...rest } = data;

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

			if (distributionChannels !== undefined) {
				const dataParsed = distributionChannels.map((d) => {
					if (!d.id) {
						throw DistributionChannelException.ID_REQUIRED_FOR_UPDATE();
					}

					return {
						id: d.id,
						data: {
							aggregatorId: d.aggregatorId,
							protocol: d.protocol,
							credentials: d.credentials,
							isSystemDefault: d.isSystemDefault,
							isActive: d.isActive,
						},
						userId,
						manager,
					};
				});
				await this.distributionChannelService.bulkUpdate(dataParsed);
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
}
