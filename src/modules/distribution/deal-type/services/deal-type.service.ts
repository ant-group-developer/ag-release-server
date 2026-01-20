import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { newTransaction } from 'src/utils/utils.transaction';
import { Not, Repository } from 'typeorm';
import { DealTypeException } from '../const/deal-type.const';
import {
	CreateDealTypeDto,
	GetListDealTypesDto,
	UpdateDealTypeDto,
} from '../dto/deal-type.dto';
import { DealType } from '../entities/deal-type.entity';
import { DealTypeQueryService } from './deal-type.query.service';

@Injectable()
export class DealTypesService {
	constructor(
		@InjectRepository(DealType)
		private readonly repo: Repository<DealType>,

		private readonly queryService: DealTypeQueryService,
	) {}

	async create({
		data,
		userId,
	}: {
		data: CreateDealTypeDto;
		userId: string;
	}) {
		await this.validateUnique({ code: data.code, name: data.name });

		const entity = this.repo.create({
			...data,
			creatorId: userId,
			modifierId: userId,
		});

		const transaction = await newTransaction(this.repo);

		try {
			const { manager } = transaction;
			const txRepo = manager.getRepository(DealType);

			const row = await txRepo.save(entity);

			await transaction.commitTransaction();
			return this.findOne(row.id);
		} catch (e) {
			await transaction.rollbackTransaction();
			throw e;
		} finally {
			await transaction.release();
		}
	}

	async findOne(id: string) {
		const row = await this.repo.findOne({ where: { id } });
		if (!row) throw DealTypeException.NOT_FOUND();
		return row;
	}

	async update({
		id,
		data,
		userId,
	}: {
		id: string;
		data: UpdateDealTypeDto;
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

		const transaction = await newTransaction(this.repo);

		try {
			const { manager } = transaction;
			const txRepo = manager.getRepository(DealType);

			await txRepo.update(id, {
				...data,
				modifierId: userId,
			});

			await transaction.commitTransaction();
			return this.findOne(id);
		} catch (e) {
			await transaction.rollbackTransaction();
			throw e;
		} finally {
			await transaction.release();
		}
	}

	async getList(filter: GetListDealTypesDto) {
		return this.queryService.getList(filter);
	}

	async delete(id: string) {
		// ensure exists (optional)
		await this.findOne(id);
		await this.repo.delete(id);
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
		if (code) {
			const existedByCode = await this.repo.findOne({
				where: { code, ...(excludeId ? { id: Not(excludeId) } : {}) },
			});
			if (existedByCode) throw DealTypeException.CODE_EXISTED();
		}

		if (name) {
			const existedByName = await this.repo.findOne({
				where: { name, ...(excludeId ? { id: Not(excludeId) } : {}) },
			});
			if (existedByName) throw DealTypeException.NAME_EXISTED();
		}
	}
}
