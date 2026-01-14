// aggregator.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { AggregatorException } from '../const/aggregator.constant';
import {
	CreateAggregatorDto,
	GetListAggregatorsDto,
	UpdateAggregatorDto,
} from '../dto/aggregator.dto';
import { Aggregator } from '../entities/aggregator.entity';
import { AggregatorQueryService } from './aggregator-query.service';

@Injectable()
export class AggregatorService {
	constructor(
		@InjectRepository(Aggregator)
		private readonly aggregatorRepo: Repository<Aggregator>,

		private readonly aggregatorQueryService: AggregatorQueryService,
	) {}

	async create(input: { data: CreateAggregatorDto; userId: string }) {
		const { data, userId } = input;

		await this.validateUnique({
			code: data.code,
			name: data.name,
		});

		const entity = this.aggregatorRepo.create({
			...data,
			creatorId: userId,
			modifierId: userId,
		});

		return this.aggregatorRepo.save(entity);
	}

	async findOne(id: string) {
		const entity = await this.aggregatorRepo.findOneBy({ id });
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
		// ensure exists
		await this.findOne(id);

		// validate unique (ignore current record)
		await this.validateUnique({
			code: data.code,
			name: data.name,
			excludeId: id,
		});

		await this.aggregatorRepo.update(id, {
			...data,
			modifierId: userId,
		});

		return await this.findOne(id);
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
