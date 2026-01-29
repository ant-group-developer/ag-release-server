// services/release-dsp-delivery-query.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { OrmAlias } from 'src/modules/orm/const/orm-alias.const';
import { orderAndPaging } from 'src/modules/orm/utils/orm.utils';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { GetListReleaseDspDeliveriesDto } from '../dto/release-dsp.dto';
import { ReleaseDspDelivery } from '../entities/release-dsp.entity';

@Injectable()
export class ReleaseDspDeliveryQueryService {
	constructor(
		@InjectRepository(ReleaseDspDelivery)
		private readonly repo: Repository<ReleaseDspDelivery>,
	) {}

	async getList(filter: GetListReleaseDspDeliveriesDto) {
		const { page, pageSize } = filter;
		const qb = this.createQbGetList(filter);

		const [items, totalItems] = await qb.getManyAndCount();

		return new PageDto({
			items,
			metadata: { page: page, pageSize, totalItems },
		});
	}

	private createQbGetList(filter: GetListReleaseDspDeliveriesDto) {
		const qb = this.repo.createQueryBuilder(OrmAlias.releaseDspDelivery);
		this.applyFilter(qb, filter);
		return qb;
	}

	private applyFilter(
		qb: SelectQueryBuilder<ReleaseDspDelivery>,
		filter: GetListReleaseDspDeliveriesDto,
	) {
		const { releaseId, dspId, status, keyword } = filter;

		if (releaseId) {
			qb.andWhere(
				`${OrmAlias.releaseDspDelivery}.releaseId = :releaseId`,
				{ releaseId },
			);
		}

		if (dspId) {
			qb.andWhere(`${OrmAlias.releaseDspDelivery}.dspId = :dspId`, {
				dspId,
			});
		}

		if (status) {
			qb.andWhere(`${OrmAlias.releaseDspDelivery}.status = :status`, {
				status,
			});
		}

		if (keyword?.length) {
			qb.andWhere(
				`${OrmAlias.releaseDspDelivery}.dspId ILIKE ANY(:keywords)`,
				{ keywords: keyword.map((k) => `%${k}%`) },
			);
		}

		orderAndPaging({
			qb,
			filter,
			alias: OrmAlias.releaseDspDelivery,
		});
	}
}
