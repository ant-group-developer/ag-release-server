import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { newTransaction } from 'src/utils/utils.transaction';
import { Not, Repository } from 'typeorm';
import { DspDealException } from '../const/dsp-deal.const';
import {
	CreateDspDealDto,
	GetListDspDealsDto,
	UpdateDspDealDto,
} from '../dto/dsp-deal.dto';
import { DspDeal } from '../entities/dsp-deal.entity';
import { DspDealsQueryService } from './dsp-deal.query.service';

@Injectable()
export class DspDealsService {
	constructor(
		@InjectRepository(DspDeal)
		private readonly repo: Repository<DspDeal>,
		private readonly queryService: DspDealsQueryService,
	) {}

	async create({ data }: { data: CreateDspDealDto }) {
		await this.validateUnique({
			dspId: data.dspId,
			dealTypeId: data.dealTypeId,
		});

		const entity = this.repo.create({
			...data,
			enabled: data.enabled ?? true,
			order: data.order ?? 0,
		});

		const transaction = await newTransaction(this.repo);

		try {
			const { manager } = transaction;
			const txRepo = manager.getRepository(DspDeal);

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
		const row = await this.repo.findOne({
			where: { id },
			relations: { dsp: true, dealType: true },
		});
		if (!row) throw DspDealException.NOT_FOUND();
		return row;
	}

	async update({ id, data }: { id: string; data: UpdateDspDealDto }) {
		await this.findOne(id);

		const transaction = await newTransaction(this.repo);

		try {
			const { manager } = transaction;
			const txRepo = manager.getRepository(DspDeal);

			await txRepo.update(id, {
				...data,
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

	async getList(filter: GetListDspDealsDto) {
		return this.queryService.getList(filter);
	}

	async delete(id: string) {
		await this.findOne(id);
		await this.repo.delete(id);
	}

	private async validateUnique({
		dspId,
		dealTypeId,
		excludeId,
	}: {
		dspId: string;
		dealTypeId: string;
		excludeId?: string;
	}) {
		const existed = await this.repo.findOne({
			where: {
				dspId,
				dealTypeId,
				...(excludeId ? { id: Not(excludeId) } : {}),
			},
		});

		if (existed) throw DspDealException.UNIQUE_DSP_DEAL();
	}
}
