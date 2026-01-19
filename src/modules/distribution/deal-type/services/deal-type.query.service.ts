import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { OrmAlias } from 'src/modules/orm/const/orm-alias.const';
import { orderAndPaging2 } from 'src/modules/orm/utils/orm.utils';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { GetListDealTypesDto } from '../dto/deal-type.dto';
import { DealTypeEntity } from '../entities/deal-type.entity';

@Injectable()
export class DealTypeQueryService {
	constructor(
		@InjectRepository(DealTypeEntity)
		private readonly repo: Repository<DealTypeEntity>,
	) {}

	async getList(filter: GetListDealTypesDto) {
		const { page, pageSize } = filter;
		const qb = this.createQbGetList(filter);

		const [items, totalItems] = await qb.getManyAndCount();

		return new PageDto({
			items,
			metadata: { pageSize, currentPage: page, totalItems },
		});
	}

	private createQbGetList(filter: GetListDealTypesDto) {
		const qb = this.repo.createQueryBuilder(
			OrmAlias.dealType ?? 'dealType',
		);
		this.applyFilter({ qb, filter });
		return qb;
	}

	private applyFilter({
		qb,
		filter,
	}: {
		qb: SelectQueryBuilder<DealTypeEntity>;
		filter: GetListDealTypesDto;
	}) {
		const alias = OrmAlias.dealType ?? 'dealType';
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
