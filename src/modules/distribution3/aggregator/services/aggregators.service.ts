// src/modules/aggregators/services/aggregator.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { GetListAggregatorsDto } from 'src/modules/distribution-channel/dto/aggregator.dto';
import { newTransaction } from 'src/utils/utils.transaction';
import { EntityManager, Not, Repository } from 'typeorm';
import { SftpConfigsService } from '../../sftp-configs/services/sftp-config.service';
import { AggregatorException } from '../const/aggregator.const';
import {
	CreateAggregatorDto,
	UpdateAggregatorDto,
} from '../dto/aggregator.dto';
import { Aggregator } from '../entities/aggregator.entity';
import { AggregatorQueryService } from './aggregator.query.service';

@Injectable()
export class AggregatorsService {
	constructor(
		@InjectRepository(Aggregator)
		private readonly repo: Repository<Aggregator>,
		private readonly queryService: AggregatorQueryService,

		private readonly sftpConfigsService: SftpConfigsService,
	) {}

	async getList(filter: GetListAggregatorsDto) {
		return this.queryService.getList(filter);
	}

	async findOne(id: string) {
		const entity = await this.repo.findOne({
			where: { id },
			relations: { sftpConfig: true },
		});
		if (!entity) throw AggregatorException.NOT_FOUND();
		return entity;
	}

	async create({
		data,
		userId,
	}: {
		data: CreateAggregatorDto;
		userId: string;
	}) {
		const { sftpConfig, ...rest } = data;

		await this.validateUnique({ code: data.code, name: data.name });

		const queryRunner = await newTransaction(this.repo);

		try {
			const { manager } = queryRunner;

			const aggregatorRepo = manager.getRepository(Aggregator);

			const entity = aggregatorRepo.create({
				...rest,
				creatorId: userId,
				modifierId: userId,
			});

			const aggregator = await aggregatorRepo.save(entity);

			if (sftpConfig) {
				await this.sftpConfigsService.upsert({
					userId,
					data: { ...sftpConfig, aggregatorId: aggregator.id },
					manager,
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

	async update({
		id,
		data,
		userId,
	}: {
		id: string;
		data: UpdateAggregatorDto;
		userId: string;
	}) {
		const entity = await this.repo.findOne({ where: { id } });
		if (!entity) throw AggregatorException.NOT_FOUND();

		await this.validateUnique({
			id,
			code: data.code,
			name: data.name,
		});

		await this.repo.update(
			{ id },
			{
				...data,
				modifierId: userId,
			},
		);

		return this.findOne(id);
	}

	async delete({ id, userId }: { id: string; userId: string }) {
		const entity = await this.repo.findOne({ where: { id } });
		if (!entity) throw AggregatorException.NOT_FOUND();

		await this.repo.update({ id }, { modifierId: userId });
		await this.repo.delete({ id });

		return { id };
	}

	private async validateUnique({
		id,
		code,
		name,
	}: {
		id?: string;
		code?: string;
		name?: string;
	}) {
		if (code) {
			const existCode = await this.repo.findOne({
				where: {
					code,
					...(id ? { id: Not(id) } : {}),
				},
			});
			if (existCode) throw AggregatorException.CODE_EXISTED();
		}

		if (name) {
			const existName = await this.repo.findOne({
				where: {
					name,
					...(id ? { id: Not(id) } : {}),
				},
			});
			if (existName) throw AggregatorException.NAME_EXISTED();
		}
	}

	protected getDeliveryAggregatorRepo(manager?: EntityManager) {
		return manager ? manager.getRepository(Aggregator) : this.repo;
	}
}
