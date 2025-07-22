import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryGetListTimezoneDto } from '../dto/timezone.dto';
import { Timezone } from '../entities/timezone.entity';

@Injectable()
export class TimezoneQueryService {
	constructor(
		@InjectRepository(Timezone)
		private readonly timezoneRepo: Repository<Timezone>,
	) { }

	createQueryGetList(query: QueryGetListTimezoneDto) {
		const {
			keyword,
			name,
			utc,
			zone,

			startCreatedAt,
			endCreatedAt,
			startUpdatedAt,
			endUpdatedAt,

			fieldOrder,
			orderBy,

			skip,
			pageSize,
		} = query;

		const queryBuilder = this.timezoneRepo.createQueryBuilder('timezone');

		if (keyword) {
			queryBuilder.andWhere('timezone.name ILIKE :keyword', {
				keyword: `%${keyword}%`,
			});
		}

		if (name) {
			queryBuilder.andWhere('timezone.name ILIKE :name', {
				name: `%${name}%`,
			});
		}

		if (utc) {
			queryBuilder.andWhere('timezone.utc ILIKE :utc', {
				utc: `%${utc}%`,
			});
		}

		if (zone) {
			queryBuilder.andWhere('timezone.zone ILIKE :zone', {
				zone: `%${zone}%`,
			});
		}

		if (startCreatedAt && endCreatedAt) {
			queryBuilder.andWhere(
				`timezone.createdAt BETWEEN :startCreatedAt AND :endCreatedAt`,
				{
					startCreatedAt,
					endCreatedAt,
				},
			);
		}

		if (startUpdatedAt && endUpdatedAt) {
			queryBuilder.andWhere(
				`timezone.updatedAt BETWEEN :startUpdatedAt AND :endUpdatedAt`,
				{
					startUpdatedAt,
					endUpdatedAt,
				},
			);
		}

		queryBuilder.orderBy(`timezone.${fieldOrder}`, orderBy);
		queryBuilder.skip(skip).take(pageSize);

		return queryBuilder;
	}

	async findOneWithCountRelation(id: string) {
		const queryBuilder = this.timezoneRepo
			.createQueryBuilder('timezone')
			.where('timezone.id = :id', { id })
			.loadRelationCountAndMap(
				'timezone.releasesCount',
				'timezone.releases'
			);

		return await queryBuilder.getOne();
	}

}
