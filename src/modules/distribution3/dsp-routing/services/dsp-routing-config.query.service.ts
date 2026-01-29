// src/modules/dsp-routing-configs/services/dsp-routing-config.query.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { PageDto } from 'src/common/dtos/common.response.dto';
import { OrmAlias } from 'src/modules/orm/const/orm-alias.const';
import { orderAndPaging2 } from 'src/modules/orm/utils/orm.utils';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { GetListDspRoutingConfigsDto } from '../dto/dsp-routing-config.dto';
import { DspRoutingConfig } from '../entities/dsp-routing-config.entity';

@Injectable()
export class DspRoutingConfigQueryService {
	constructor(
		@InjectRepository(DspRoutingConfig)
		private readonly repo: Repository<DspRoutingConfig>,
	) {}

	async getList(filter: GetListDspRoutingConfigsDto) {
		const { page, pageSize } = filter;

		const qb = this.createQbGetList(filter);
		const [items, totalItems] = await qb.getManyAndCount();

		return new PageDto({
			items,
			metadata: { pageSize, page: page, totalItems },
		});
	}

	private createQbGetList(filter: GetListDspRoutingConfigsDto) {
		const qb = this.repo.createQueryBuilder(OrmAlias.dspRoutingConfig);
		this.applyFilter({ qb, filter });
		return qb;
	}

	private applyFilter({
		qb,
		filter,
	}: {
		qb: SelectQueryBuilder<DspRoutingConfig>;
		filter: GetListDspRoutingConfigsDto;
	}) {
		const alias = OrmAlias.dspRoutingConfig;
		const { keyword } = filter;

		if (keyword?.length) {
			qb.andWhere(
				`(
					${alias}.dspId ILIKE ANY(:keywords)
				)`,
				{ keywords: keyword.map((k) => `%${k}%`) },
			);
		}

		orderAndPaging2({ qb, filter });
	}
}
