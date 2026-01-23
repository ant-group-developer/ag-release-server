import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { newTransaction } from 'src/utils/utils.transaction';
import { Repository } from 'typeorm';
import { DspDealConfigException } from '../const/dsp-deal-config.const';
import {
	CreateDspDealConfigDto,
	GetListDspDealConfigsDto,
	UpdateDspDealConfigDto,
} from '../dto/dsp-deal-config.dto';
import { DspDealConfigEntity } from '../entities/dsp-deal-config.entity';
import {
	DspDealConfigScope,
	DspDealConfigStatus,
} from '../enum/dsp-deal-config.enum';
import { DspDealConfigsQueryService } from './dsp-deal-config.query.service';

@Injectable()
export class DspDealConfigsService {
	constructor(
		@InjectRepository(DspDealConfigEntity)
		private readonly repo: Repository<DspDealConfigEntity>,
		private readonly queryService: DspDealConfigsQueryService,
	) {}

	async create({ data }: { data: CreateDspDealConfigDto }) {
		this.validateScopeRules(data);

		await this.validateUniqueOnCreate({
			dspId: data.dspId,
			dealTypeId: data.dealTypeId,
			scope: data.scope,
			userId: data.userId ?? null,
		});

		const entity = this.repo.create({
			...data,
			userId: data.userId ?? null,
			status: data.status ?? DspDealConfigStatus.ACTIVE,
		});

		const tx = await newTransaction(this.repo);
		try {
			const { manager } = tx;
			const txRepo = manager.getRepository(DspDealConfigEntity);

			const row = await txRepo.save(entity);

			await tx.commitTransaction();
			return this.findOne(row.id);
		} catch (e) {
			await tx.rollbackTransaction();
			throw e;
		} finally {
			await tx.release();
		}
	}

	async findOne(id: string) {
		const row = await this.repo.findOne({
			where: { id },
			relations: { dsp: true, dealType: true, user: true },
		});
		if (!row) throw DspDealConfigException.NOT_FOUND();
		return row;
	}

	async update({ id, data }: { id: string; data: UpdateDspDealConfigDto }) {
		await this.findOne(id);

		const tx = await newTransaction(this.repo);
		try {
			const { manager } = tx;
			const txRepo = manager.getRepository(DspDealConfigEntity);

			await txRepo.update(id, {
				...data,
			});

			await tx.commitTransaction();
			return this.findOne(id);
		} catch (e) {
			await tx.rollbackTransaction();
			throw e;
		} finally {
			await tx.release();
		}
	}

	async getList(filter: GetListDspDealConfigsDto) {
		return this.queryService.getList(filter);
	}

	async delete(id: string) {
		await this.findOne(id);
		await this.repo.delete(id);
	}

	private validateScopeRules(data: CreateDspDealConfigDto) {
		if (data.scope === DspDealConfigScope.USER_OVERRIDE) {
			if (!data.userId)
				throw DspDealConfigException.USER_ID_REQUIRED_FOR_OVERRIDE();
		}

		if (data.scope === DspDealConfigScope.GLOBAL_DEFAULT) {
			if (data.userId)
				throw DspDealConfigException.USER_ID_MUST_BE_NULL_FOR_GLOBAL();
		}
	}

	private async validateUniqueOnCreate({
		dspId,
		dealTypeId,
		scope,
		userId,
	}: {
		dspId: string;
		dealTypeId: string;
		scope: DspDealConfigScope;
		userId: string | null;
	}) {
		if (scope === DspDealConfigScope.GLOBAL_DEFAULT) {
			const existed = await this.repo.findOne({
				where: {
					dspId,
					dealTypeId,
					scope: DspDealConfigScope.GLOBAL_DEFAULT,
				},
			});
			if (existed) throw DspDealConfigException.GLOBAL_DEFAULT_EXISTED();
		}

		if (scope === DspDealConfigScope.USER_OVERRIDE) {
			const existed = await this.repo.findOne({
				// where: {
				// 	userId,
				// 	dspId,
				// 	dealTypeId,
				// 	scope: DspDealConfigScope.USER_OVERRIDE,
				// },
			});
			if (existed) throw DspDealConfigException.USER_OVERRIDE_EXISTED();
		}
	}
}
