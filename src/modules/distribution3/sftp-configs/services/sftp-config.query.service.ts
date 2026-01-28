// src/modules/sftp-configs/services/sftp-config.query.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { OrmAlias } from 'src/modules/orm/const/orm-alias.const';
import { orderAndPaging2 } from 'src/modules/orm/utils/orm.utils';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { GetListSftpConfigsDto } from '../dto/sftp-config.dto';
import { SftpConfig } from '../entities/sftp-config.entity';

@Injectable()
export class SftpConfigQueryService {
	constructor(
		@InjectRepository(SftpConfig)
		private readonly repo: Repository<SftpConfig>,
	) {}

	async getList(filter: GetListSftpConfigsDto) {
		const { page, pageSize } = filter;

		const qb = this.createQbGetList(filter);
		const [items, totalItems] = await qb.getManyAndCount();

		return new PageDto({
			items,
			metadata: { pageSize, currentPage: page, totalItems },
		});
	}

	private createQbGetList(filter: GetListSftpConfigsDto) {
		const qb = this.repo.createQueryBuilder(OrmAlias.sftpConfig);
		this.applyFilter({ qb, filter });
		return qb;
	}

	private applyFilter({
		qb,
		filter,
	}: {
		qb: SelectQueryBuilder<SftpConfig>;
		filter: GetListSftpConfigsDto;
	}) {
		const { keyword } = filter;

		// if (keyword?.length) {
		// 	qb.andWhere(`(${alias}.dspId ILIKE ANY(:keywords))`, {
		// 		keywords: keyword.map((k) => `%${k}%`),
		// 	});
		// }

		orderAndPaging2({ qb, filter });
	}
}
