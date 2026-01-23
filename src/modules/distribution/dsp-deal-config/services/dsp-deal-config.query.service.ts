import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { GetListDspDealConfigsDto } from '../dto/dsp-deal-config.dto';
import { DspDealConfigEntity } from '../entities/dsp-deal-config.entity';

@Injectable()
export class DspDealConfigsQueryService {
	constructor(
		@InjectRepository(DspDealConfigEntity)
		private readonly repo: Repository<DspDealConfigEntity>,
	) {}

	async getList(filter: GetListDspDealConfigsDto) {
		const qb = this.createQb(filter);

		const [items, totalItems] = await qb.getManyAndCount();

		return new PageDto({
			items,
			metadata: filter,
		});
	}

	private createQb(filter: GetListDspDealConfigsDto) {
		const qb = this.repo.createQueryBuilder('cfg');

		qb.leftJoinAndSelect('cfg.dsp', 'dsp');
		qb.leftJoinAndSelect('cfg.dealType', 'dealType');
		qb.leftJoinAndSelect('cfg.user', 'user');

		this.applyFilter({ qb, filter });

		qb.skip(filter.skip).take(filter.limit);

		// default sort: newest
		qb.orderBy('cfg.updatedAt', 'DESC');

		return qb;
	}

	private applyFilter({
		qb,
		filter,
	}: {
		qb: SelectQueryBuilder<DspDealConfigEntity>;
		filter: GetListDspDealConfigsDto;
	}) {
		const { dspId, dealTypeId, userId, scope, status } = filter;

		if (dspId) qb.andWhere('cfg.dspId = :dspId', { dspId });
		if (dealTypeId)
			qb.andWhere('cfg.dealTypeId = :dealTypeId', { dealTypeId });
		if (userId) qb.andWhere('cfg.userId = :userId', { userId });
		if (scope) qb.andWhere('cfg.scope = :scope', { scope });
		if (status) qb.andWhere('cfg.status = :status', { status });
	}
}
