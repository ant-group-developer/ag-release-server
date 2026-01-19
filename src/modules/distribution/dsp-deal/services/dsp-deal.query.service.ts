import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { orderAndPaging2 } from 'src/modules/orm/utils/orm.utils';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { GetListDspDealsDto } from '../dto/dsp-deal.dto';
import { DspDealEntity } from '../entities/dsp-deal.entity';

@Injectable()
export class DspDealsQueryService {
	constructor(
		@InjectRepository(DspDealEntity)
		private readonly repo: Repository<DspDealEntity>,
	) {}

	async getList(filter: GetListDspDealsDto) {
		const { page, pageSize } = filter;
		const qb = this.createQbGetList(filter);

		const [items, totalItems] = await qb.getManyAndCount();

		return new PageDto({
			items,
			metadata: { pageSize, currentPage: page, totalItems },
		});
	}

	private createQbGetList(filter: GetListDspDealsDto) {
		const qb = this.repo.createQueryBuilder('dspDeal');

		qb.leftJoinAndSelect('dspDeal.dsp', 'dsp');
		qb.leftJoinAndSelect('dspDeal.dealType', 'dealType');

		this.applyFilter({ qb, filter });

		return qb;
	}

	private applyFilter({
		qb,
		filter,
	}: {
		qb: SelectQueryBuilder<DspDealEntity>;
		filter: GetListDspDealsDto;
	}) {
		const { dspId, dealTypeId, visibility, enabled } = filter;

		if (dspId) qb.andWhere('dspDeal.dspId = :dspId', { dspId });
		if (dealTypeId)
			qb.andWhere('dspDeal.dealTypeId = :dealTypeId', { dealTypeId });
		if (visibility)
			qb.andWhere('dspDeal.visibility = :visibility', { visibility });

		// enabled có thể là false nên check undefined
		if (enabled !== undefined)
			qb.andWhere('dspDeal.enabled = :enabled', { enabled });

		orderAndPaging2({ qb, filter });
	}
}
