// src/modules/ftp-provider-config/services/ftp-provider-config.query.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { OrmAlias } from 'src/modules/orm/const/orm-alias.const';
import { orderAndPaging2 } from 'src/modules/orm/utils/orm.utils';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { GetListFtpProviderConfigsDto } from '../dto/ftp-provider-config.dto';
import { FtpProviderConfig } from '../entities/ftp-provider-config.entity';

@Injectable()
export class FtpProviderConfigQueryService {
	constructor(
		@InjectRepository(FtpProviderConfig)
		private readonly repo: Repository<FtpProviderConfig>,
	) {}

	async getList(filter: GetListFtpProviderConfigsDto) {
		const { page, pageSize } = filter;

		const qb = this.createQbGetList(filter);
		const [items, totalItems] = await qb.getManyAndCount();

		return new PageDto({
			items,
			metadata: { pageSize, page, totalItems },
		});
	}

	private createQbGetList(filter: GetListFtpProviderConfigsDto) {
		const qb = this.repo.createQueryBuilder(OrmAlias.ftpProviderConfig);
		this.applyFilter({ qb, filter });
		return qb;
	}

	private applyFilter({
		qb,
		filter,
	}: {
		qb: SelectQueryBuilder<FtpProviderConfig>;
		filter: GetListFtpProviderConfigsDto;
	}) {
		const { keyword } = filter;

		if (keyword?.length) {
			qb.andWhere(
				`(${OrmAlias.ftpProviderConfig}.code ILIKE ANY(:keywords) OR ${OrmAlias.ftpProviderConfig}.name ILIKE ANY(:keywords))`,
				{
					keywords: keyword.map((k) => `%${k}%`),
				},
			);
		}

		orderAndPaging2({ qb, filter });
	}
}
