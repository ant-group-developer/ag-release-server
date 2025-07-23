import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryGetListTrackOriginTypeDto } from '../dto/track-origin-type.dto';
import { TrackOriginType } from '../entities/track-origin-type.entity';

@Injectable()
export class TrackOriginTypeQueryService {
	constructor(
		@InjectRepository(TrackOriginType)
		private readonly trackOriginTypeRepo: Repository<TrackOriginType>,
	) {}

	createQueryGetList(query: QueryGetListTrackOriginTypeDto) {
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

		const queryBuilder =
			this.trackOriginTypeRepo.createQueryBuilder('trackOriginType');

		if (keyword) {
			queryBuilder.andWhere('trackOriginType.name ILIKE :keyword', {
				keyword: `%${keyword}%`,
			});
		}

		if (startCreatedAt && endCreatedAt) {
			queryBuilder.andWhere(
				`trackOriginType.createdAt BETWEEN :startCreatedAt AND :endCreatedAt`,
				{
					startCreatedAt,
					endCreatedAt,
				},
			);
		}

		if (startUpdatedAt && endUpdatedAt) {
			queryBuilder.andWhere(
				`trackOriginType.updatedAt BETWEEN :startUpdatedAt AND :endUpdatedAt`,
				{
					startUpdatedAt,
					endUpdatedAt,
				},
			);
		}

		queryBuilder.orderBy(`trackOriginType.${fieldOrder}`, orderBy);
		queryBuilder.skip(skip).take(pageSize);

		return queryBuilder;
	}

	async findOneWithCountRelation(id: string) {
		return await this.trackOriginTypeRepo
			.createQueryBuilder('trackOriginType')
			.where('trackOriginType.id = :id', { id })
			.loadRelationCountAndMap(
				'trackOriginType.tracksCount',
				'trackOriginType.tracks',
			)
			.getOne();
	}
}
