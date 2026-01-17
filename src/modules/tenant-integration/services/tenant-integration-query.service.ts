import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { OrmAlias } from 'src/modules/orm/const/orm-alias.const';
import { orderAndPaging } from 'src/modules/orm/utils/orm.utils';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { GetListTenantIntegrationsDto } from '../dto/tenant-integration.dto';
import { TenantIntegration } from '../entites/tenant-integration.entity';
import { TenantIntegrationFm } from '../fm/tenant-integration.fm';

@Injectable()
export class TenantIntegrationQueryService {
	constructor(
		@InjectRepository(TenantIntegration)
		private readonly tenantIntegrationRepo: Repository<TenantIntegration>,
	) {}

	async getList(filter: GetListTenantIntegrationsDto) {
		const { page, pageSize } = filter;

		const qb = this.createQbGetList(filter);

		const [items, totalItems] = await qb.getManyAndCount();

		return new PageDto({
			items,
			metadata: {
				pageSize,
				currentPage: page,
				totalItems,
			},
		});
	}

	private createQbGetList(filter: GetListTenantIntegrationsDto) {
		const qb = this.tenantIntegrationRepo.createQueryBuilder(
			OrmAlias.tenantIntegration,
		);

		qb.leftJoinAndSelect(TenantIntegrationFm.dsp, OrmAlias.dsp);
		qb.leftJoinAndSelect(TenantIntegrationFm.tenant, OrmAlias.tenant);
		qb.leftJoinAndSelect(
			TenantIntegrationFm.connections,
			OrmAlias.tenantIntegrationConnection,
		);

		this.applyFilter({ qb, filter });

		return qb;
	}

	private applyFilter({
		qb,
		filter,
	}: {
		qb: SelectQueryBuilder<TenantIntegration>;
		filter: GetListTenantIntegrationsDto;
	}) {
		const { tenantId, dspId, isActive, keyword } = filter;

		if (tenantId) {
			qb.andWhere(`${TenantIntegrationFm.tenantId} = :tenantId`, {
				tenantId,
			});
		}

		if (dspId) {
			qb.andWhere(`${TenantIntegrationFm.dspId} = :dspId`, {
				dspId,
			});
		}

		if (isActive !== undefined) {
			qb.andWhere(`${TenantIntegrationFm.isActive} = :isActive`, {
				isActive,
			});
		}

		if (keyword?.length) {
			qb.andWhere(
				`(
					${OrmAlias.dsp}.name ILIKE ANY(:keywords)
					OR ${OrmAlias.tenant}.name ILIKE ANY(:keywords)
				)`,
				{
					keywords: keyword.map((k) => `%${k}%`),
				},
			);
		}

		orderAndPaging({
			qb,
			filter,
			alias: OrmAlias.tenantIntegration,
		});
	}
}
