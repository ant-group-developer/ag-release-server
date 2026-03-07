// src/modules/file-node/services/file-node.query.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto } from 'src/common/dtos/common.response.dto';
import { orderAndPaging2 } from 'src/modules/orm/utils/orm.utils';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { GetListFileNodesDto } from '../dto/create-file-node.dto';
import { FileNode } from '../entities/file-node.entity';

@Injectable()
export class FileNodeQueryService {
	constructor(
		@InjectRepository(FileNode)
		private readonly repo: Repository<FileNode>,
	) {}

	async getList(filter: GetListFileNodesDto) {
		const { page, pageSize } = filter;

		const qb = this.createQbGetList(filter);
		const [items, totalItems] = await qb.getManyAndCount();

		return new PageDto({
			items,
			metadata: { pageSize, page, totalItems },
		});
	}

	private createQbGetList(filter: GetListFileNodesDto) {
		const qb = this.repo.createQueryBuilder('fileNode');
		this.applyFilter({ qb, filter });
		return qb;
	}

	private applyFilter({
		qb,
		filter,
	}: {
		qb: SelectQueryBuilder<FileNode>;
		filter: GetListFileNodesDto;
	}) {
		const alias = 'fileNode';
		const { keyword, parentId, type } = filter;

		if (parentId === null) qb.andWhere(`${alias}.parent_id IS NULL`);
		if (typeof parentId === 'string')
			qb.andWhere(`${alias}.parent_id = :parentId`, { parentId });

		if (type) qb.andWhere(`${alias}.type = :type`, { type });

		if (keyword?.length) {
			qb.andWhere(`(${alias}.name ILIKE ANY(:keywords))`, {
				keywords: keyword.map((k) => `%${k}%`),
			});
		}

		orderAndPaging2({ qb, filter });
	}
}
