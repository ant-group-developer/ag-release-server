// src/modules/distribution/delivery-config/services/delivery-config.query.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { orderAndPaging2 } from 'src/modules/orm/utils/orm.utils';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { GetListDeliveryConfigsDto } from '../dto/delivery-config.dto';
import { DeliveryConfig } from '../entities/delivery-config.entity';

@Injectable()
export class DeliveryConfigQueryService {
	constructor(
		@InjectRepository(DeliveryConfig)
		private readonly repo: Repository<DeliveryConfig>,
	) {}

	async getList(filter: GetListDeliveryConfigsDto) {
		const { page, pageSize } = filter;
		const qb = this.createQbGetList(filter);
		const [items, totalItems] = await qb.getManyAndCount();
		return new PageDto({
			items,
			metadata: { pageSize, page, totalItems },
		});
	}

	private createQbGetList(filter: GetListDeliveryConfigsDto) {
		const qb = this.repo.createQueryBuilder('deliveryConfig');
		this.applyFilter({ qb, filter });
		return qb;
	}

	private applyFilter({
		qb,
		filter,
	}: {
		qb: SelectQueryBuilder<DeliveryConfig>;
		filter: GetListDeliveryConfigsDto;
	}) {
		const { keyword, isActive, id } = filter;

		if (typeof id === 'number') {
			qb.andWhere('deliveryConfig.id = :id', { id });
		}

		if (typeof isActive === 'boolean') {
			qb.andWhere('deliveryConfig.is_active = :isActive', { isActive });
		}

		if (keyword?.length) {
			qb.andWhere(
				`(deliveryConfig.name ILIKE ANY(:keywords) OR deliveryConfig.provider_code ILIKE ANY(:keywords) OR deliveryConfig.sftp_host ILIKE ANY(:keywords))`,
				{ keywords: keyword.map((k) => `%${k}%`) },
			);
		}

		orderAndPaging2({
			qb,
			filter,
		});
	}
}
