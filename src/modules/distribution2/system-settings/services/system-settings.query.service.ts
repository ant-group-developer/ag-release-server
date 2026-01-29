// src/modules/distribution/system-settings/services/system-settings.query.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { PageDto } from 'src/common/dtos/common.response.dto';
import { orderAndPaging2 } from 'src/modules/orm/utils/orm.utils';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { GetListSystemSettingsDto } from '../dto/system-settings.dto';
import { SystemSetting } from '../entities/system-setting.entity';

@Injectable()
export class SystemSettingsQueryService {
	constructor(
		@InjectRepository(SystemSetting)
		private readonly repo: Repository<SystemSetting>,
	) {}

	async getList(filter: GetListSystemSettingsDto) {
		const { page, pageSize } = filter;
		const qb = this.createQbGetList(filter);
		const [items, totalItems] = await qb.getManyAndCount();
		return new PageDto({
			items,
			metadata: { pageSize, page, totalItems },
		});
	}

	private createQbGetList(filter: GetListSystemSettingsDto) {
		const qb = this.repo.createQueryBuilder('systemSetting');
		this.applyFilter({ qb, filter });
		return qb;
	}

	private applyFilter({
		qb,
		filter,
	}: {
		qb: SelectQueryBuilder<SystemSetting>;
		filter: GetListSystemSettingsDto;
	}) {
		const { keyword } = filter;

		if (keyword?.length) {
			qb.andWhere(
				`(systemSetting.key ILIKE ANY(:keywords) OR systemSetting.value ILIKE ANY(:keywords) OR systemSetting.description ILIKE ANY(:keywords))`,
				{ keywords: keyword.map((k) => `%${k}%`) },
			);
		}

		orderAndPaging2({
			qb,
			filter,
		});
	}
}
