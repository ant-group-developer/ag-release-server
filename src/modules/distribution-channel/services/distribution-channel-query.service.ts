// services/distribution-channel-query.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { OrmAlias } from 'src/modules/orm/const/orm-alias.const';
import { orderAndPaging } from 'src/modules/orm/utils/orm.utils';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { GetListDistributionChannelsDto } from '../dto/distribution-channel.dto';
import { DistributionChannel } from '../entities/distribution-channel.entity';

@Injectable()
export class DistributionChannelQueryService {
	constructor(
		@InjectRepository(DistributionChannel)
		private readonly repo: Repository<DistributionChannel>,
	) {}

	async getList(filter: GetListDistributionChannelsDto) {
		const { page, pageSize } = filter;
		const qb = this.createQbGetList(filter);

		const [items, totalItems] = await qb.getManyAndCount();

		return new PageDto({
			items,
			metadata: { currentPage: page, pageSize, totalItems },
		});
	}

	private createQbGetList(filter: GetListDistributionChannelsDto) {
		const qb = this.repo.createQueryBuilder(OrmAlias.distributionChannel);
		this.applyFilter(qb, filter);
		return qb;
	}

	private applyFilter(
		qb: SelectQueryBuilder<DistributionChannel>,
		filter: GetListDistributionChannelsDto,
	) {
		const {
			//  tenantId, dspId,
			keyword,
		} = filter;

		// if (tenantId) {
		// 	qb.andWhere(
		// 		`${OrmAlias.distributionChannel}.tenantId = :tenantId`,
		// 		{
		// 			tenantId,
		// 		},
		// 	);
		// }

		// if (dspId) {
		// 	qb.andWhere(`${OrmAlias.distributionChannel}.dspId = :dspId`, {
		// 		dspId,
		// 	});
		// }

		if (keyword?.length) {
			qb.andWhere(
				`${OrmAlias.distributionChannel}.protocol ILIKE ANY(:keywords)`,
				{ keywords: keyword.map((k) => `%${k}%`) },
			);
		}

		orderAndPaging({
			qb,
			filter,
			alias: OrmAlias.distributionChannel,
		});
	}
}
