// src/modules/distribution/dsp-routing/services/dsp-routing.query.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { OrmAlias } from 'src/modules/orm/const/orm-alias.const';
import {
	dspRoutingLeftJoinDirectConfig,
	dspRoutingLeftJoinDsp,
	dspRoutingLeftJoinSpecificAggregatorConfig,
} from 'src/modules/orm/utils/orm.join';
import { orderAndPaging2 } from 'src/modules/orm/utils/orm.utils';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { GetListDspRoutingSettingsDto } from '../dto/dsp-routing.dto';
import { DspRoutingSetting } from '../entities/dsp-routing-setting.entity';

@Injectable()
export class DspRoutingQueryService {
	constructor(
		@InjectRepository(DspRoutingSetting)
		private readonly repo: Repository<DspRoutingSetting>,
	) {}

	async getList(filter: GetListDspRoutingSettingsDto) {
		const { page, pageSize } = filter;
		const qb = this.createQbGetList(filter);
		const [items, totalItems] = await qb.getManyAndCount();
		return new PageDto({
			items,
			metadata: { pageSize, currentPage: page, totalItems },
		});
	}

	//
	private createQbGetList(filter: GetListDspRoutingSettingsDto) {
		const qb = this.repo.createQueryBuilder(OrmAlias.dspRouting);

		this.leftJoinTables(qb);
		this.applyFilter({ qb, filter });
		return qb;
	}

	private applyFilter({
		qb,
		filter,
	}: {
		qb: SelectQueryBuilder<DspRoutingSetting>;
		filter: GetListDspRoutingSettingsDto;
	}) {
		const { dspId, mode } = filter;

		if (dspId) qb.andWhere('dspRouting.dspId = :dspId', { dspId });
		if (mode) qb.andWhere('dspRouting.mode = :mode', { mode });

		orderAndPaging2({
			qb,
			filter,
		});
	}

	private leftJoinTables(qb: SelectQueryBuilder<any>) {
		dspRoutingLeftJoinDsp({ qb });
		dspRoutingLeftJoinDirectConfig({ qb });
		dspRoutingLeftJoinSpecificAggregatorConfig({ qb });
	}
}
