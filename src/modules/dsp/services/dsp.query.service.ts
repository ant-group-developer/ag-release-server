import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryGetListDspDto } from '../dto/dsp.dto';
import { Dsp } from '../entities/dsp.entity';

@Injectable()
export class DspQueryService {
	constructor(
		@InjectRepository(Dsp)
		private readonly dspRepo: Repository<Dsp>,
	) {}

	createQueryGetList(query: QueryGetListDspDto) {
		const {
			keyword,

			startCreatedAt,
			endCreatedAt,
			startUpdatedAt,
			endUpdatedAt,

			fieldOrder,
			orderBy,

			skip,
			pageSize,
		} = query;

		const queryBuilder = this.dspRepo.createQueryBuilder('dsp');

		if (keyword) {
			queryBuilder.andWhere('dsp.name ILIKE :keyword', {
				keyword: `%${keyword}%`,
			});
		}

		if (startCreatedAt && endCreatedAt) {
			queryBuilder.andWhere(
				`dsp.createdAt BETWEEN :startCreatedAt AND :endCreatedAt`,
				{
					startCreatedAt,
					endCreatedAt,
				},
			);
		}

		if (startUpdatedAt && endUpdatedAt) {
			queryBuilder.andWhere(
				`dsp.updatedAt BETWEEN :startUpdatedAt AND :endUpdatedAt`,
				{
					startUpdatedAt,
					endUpdatedAt,
				},
			);
		}

		queryBuilder.orderBy(`dsp.${fieldOrder}`, orderBy);
		queryBuilder.skip(skip).take(pageSize);

		return queryBuilder;
	}

	async findOneWithCountRelation(id: string) {
		const queryBuilder = this.dspRepo
			.createQueryBuilder('dsp')
			.where('dsp.id = :id', { id })
			.loadRelationCountAndMap(
				'dsp.organizationDspsCount',
				'dsp.organizationDsps',
			)
			.loadRelationCountAndMap('dsp.releaseDspsCount', 'dsp.releaseDsps');

		return await queryBuilder.getOne();
	}
}
