// services/aggregator-query.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { OrmAlias } from 'src/modules/orm/const/orm-alias.const';
import { orderAndPaging } from 'src/modules/orm/utils/orm.utils';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { GetListAggregatorsDto } from '../dto/aggregator.dto';
import { Aggregator } from '../entities/aggregator.entity';

@Injectable()
export class AggregatorQueryService {
	constructor(
		@InjectRepository(Aggregator)
		private readonly aggregatorRepo: Repository<Aggregator>,
	) {}

	async getList(filter: GetListAggregatorsDto) {
		const { page, pageSize } = filter;
		const qb = this.createQbGetList(filter);

		const [items, totalItems] = await qb.getManyAndCount();

		return new PageDto({
			items,
			metadata: { pageSize, currentPage: page, totalItems },
		});
	}

	private createQbGetList(filter: GetListAggregatorsDto) {
		const qb = this.aggregatorRepo.createQueryBuilder(OrmAlias.aggregator);
		this.applyFilter({ qb, filter });

		return qb;
	}

	private applyFilter({
		qb,
		filter,
	}: {
		qb: SelectQueryBuilder<Aggregator>;
		filter: GetListAggregatorsDto;
	}) {
		const { keyword } = filter;

		if (keyword?.length) {
			qb.andWhere(
				`(
				${OrmAlias.aggregator}.code ILIKE ANY(:keywords)
				OR ${OrmAlias.aggregator}.name ILIKE ANY(:keywords)
			)`,
				{
					keywords: keyword.map((k) => `%${k}%`),
				},
			);
		}

		orderAndPaging({ qb, filter, alias: OrmAlias.aggregator });
	}
}
