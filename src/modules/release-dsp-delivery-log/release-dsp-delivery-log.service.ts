import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ResponseError } from 'src/common/dtos/common.response.dto';
import { Dsp } from '../dsp/entities/dsp.entity';
import { Release } from '../release/entities/release.entity';
import { CreateReleaseDspDeliveryLogDto } from './dto/create-release-dsp-delivery-log.dto';
import { QueryGetListReleaseDspDeliveryLogDto } from './dto/query-release-dsp-delivery-log.dto';
import { UpdateReleaseDspDeliveryLogDto } from './dto/update-release-dsp-delivery-log.dto';
import { ReleaseDspDeliveryLog } from './entities/release-dsp-delivery-log.entity';

@Injectable()
export class ReleaseDspDeliveryLogService {
	constructor(
		@InjectRepository(ReleaseDspDeliveryLog)
		private readonly repo: Repository<ReleaseDspDeliveryLog>,
	) {}

	async create(dto: CreateReleaseDspDeliveryLogDto) {
		const log = this.repo.create(dto);
		return this.repo.save(log);
	}

	async findAll(query: QueryGetListReleaseDspDeliveryLogDto) {
		const {
			dspId,
			level,
			keyword,
			fieldOrder,
			orderBy,
			skip,
			limit,
			startCreatedAt,
			endCreatedAt,
			startUpdatedAt,
			endUpdatedAt,
		} = query;

		const qb = this.repo
			.createQueryBuilder('log')
			.leftJoin(Release, 'release', 'release.id = log.releaseId')
			.leftJoin(Dsp, 'dsp', 'dsp.id = log.dspId')
			.addSelect([
				'release.id',
				'release.title',
				'release.upc',
				'release.status',
				'release.releaseDate',
				'release.version',
				'release.catalogId',
				'dsp.id',
				'dsp.code',
				'dsp.name',
			]);

		// filter dsp
		if (dspId?.length) {
			qb.andWhere('log.dspId IN (:...dspId)', { dspId });
		}

		// filter level
		if (level?.length) {
			qb.andWhere('log.level IN (:...level)', { level });
		}

		// search keyword
		if (keyword) {
			qb.andWhere(
				'(log.title LIKE :keyword OR log.content LIKE :keyword)',
				{
					keyword: `%${keyword}%`,
				},
			);
		}

		// filter createdAt
		if (startCreatedAt) {
			qb.andWhere('log.createdAt >= :startCreatedAt', { startCreatedAt });
		}

		if (endCreatedAt) {
			qb.andWhere('log.createdAt <= :endCreatedAt', { endCreatedAt });
		}

		// filter updatedAt
		if (startUpdatedAt) {
			qb.andWhere('log.updatedAt >= :startUpdatedAt', { startUpdatedAt });
		}

		if (endUpdatedAt) {
			qb.andWhere('log.updatedAt <= :endUpdatedAt', { endUpdatedAt });
		}

		const allowedOrderFields = ['createdAt', 'updatedAt', 'title', 'level'];

		const orderField = allowedOrderFields.includes(fieldOrder)
			? fieldOrder
			: 'createdAt';

		qb.orderBy(`log.${orderField}`, orderBy ?? 'DESC');

		qb.skip(skip).take(limit);

		const { entities, raw } = await qb.getRawAndEntities();
		const totalItems = await qb.getCount();

		const items = entities.map((log, index) => ({
			...log,
			release: {
				id: raw[index].release_id,
				title: raw[index].release_title,
				upc: raw[index].release_upc,
				status: raw[index].release_status,
				releaseDate: raw[index].release_releaseDate,
				version: raw[index].release_version,
				catalogId: raw[index].release_catalogId,
			},
			dsp: {
				id: raw[index].dsp_id,
				code: raw[index].dsp_code,
				name: raw[index].dsp_name,
			},
		}));

		return {
			items: items,
			metadata: {
				totalItems,
				page: query.page,
				pageSize: query.pageSize,
				totalPage: Math.ceil(totalItems / query.pageSize),
			},
		};
	}

	async findOne(id: string) {
		const qb = this.repo
			.createQueryBuilder('log')
			.leftJoin(Release, 'release', 'release.id = log.releaseId')
			.leftJoin(Dsp, 'dsp', 'dsp.id = log.dspId')
			.addSelect([
				'release.id',
				'release.title',
				'release.upc',
				'release.status',
				'release.releaseDate',
				'release.version',
				'release.catalogId',
				'dsp.id',
				'dsp.code',
				'dsp.name',
			])
			.where('log.id = :id', { id });

		const { entities, raw } = await qb.getRawAndEntities();

		const log = entities[0];

		if (!log) {
			throw new ResponseError({ message: 'Log not found' });
		}

		const item = {
			...log,
			release: {
				id: raw[0].release_id,
				title: raw[0].release_title,
				upc: raw[0].release_upc,
				status: raw[0].release_status,
				releaseDate: raw[0].release_releaseDate,
				version: raw[0].release_version,
				catalogId: raw[0].release_catalogId,
			},
			dsp: {
				id: raw[0].dsp_id,
				code: raw[0].dsp_code,
				name: raw[0].dsp_name,
			},
		};

		return item;
	}

	async update(id: string, dto: UpdateReleaseDspDeliveryLogDto) {
		const log = await this.findOne(id);

		await this.repo.update(id, dto);

		return log;
	}

	async remove(id: string) {
		const log = await this.findOne(id);

		await this.repo.remove(log);

		return log;
	}
}
