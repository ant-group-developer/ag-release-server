// src/modules/aggregators/services/aggregator.query.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { OrmAlias } from 'src/modules/orm/const/orm-alias.const';
import { orderAndPaging2 } from 'src/modules/orm/utils/orm.utils';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { GetListAggregatorDto } from '../dto/aggregator.dto';
import { Aggregator } from '../entities/aggregator.entity';

@Injectable()
export class AggregatorQueryService {
	constructor(
		@InjectRepository(Aggregator)
		private readonly repo: Repository<Aggregator>,
	) {}

	async getList(filter: GetListAggregatorDto) {
		const { page, pageSize } = filter;

		const qb = this.createQbGetList(filter);
		const [items, totalItems] = await qb.getManyAndCount();

		return new PageDto({
			items,
			metadata: { pageSize, page: page, totalItems },
		});
	}

	private createQbGetList(filter: GetListAggregatorDto) {
		const qb = this.repo.createQueryBuilder(OrmAlias.aggregator);
		qb.leftJoinAndSelect('aggregator.sftpConfig', 'sftpConfig');
		this.applyFilter({ qb, filter });
		return qb;
	}

	private applyFilter({
		qb,
		filter,
	}: {
		qb: SelectQueryBuilder<Aggregator>;
		filter: GetListAggregatorDto;
	}) {
		const alias = OrmAlias.aggregator;
		const { keyword } = filter;

		if (keyword?.length) {
			qb.andWhere(
				`(
					${alias}.code ILIKE ANY(:keywords)
					OR ${alias}.name ILIKE ANY(:keywords)
				)`,
				{ keywords: keyword.map((k) => `%${k}%`) },
			);
		}

		orderAndPaging2({ qb, filter });
	}
}
