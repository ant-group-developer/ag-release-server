import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryGetListTrackTypeDto } from '../dto/track-type.dto';
import { TrackType } from '../entities/track-type.entity';

@Injectable()
export class TrackTypeQueryService {
	constructor(
		@InjectRepository(TrackType)
		private readonly trackTypeRepo: Repository<TrackType>,
	) {}

	createQueryGetList(query: QueryGetListTrackTypeDto) {
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

		const queryBuilder = this.trackTypeRepo.createQueryBuilder('trackType');

		if (keyword) {
			queryBuilder.andWhere('trackType.name ILIKE :keyword', {
				keyword: `%${keyword}%`,
			});
		}

		if (startCreatedAt && endCreatedAt) {
			queryBuilder.andWhere(
				`trackType.createdAt BETWEEN :startCreatedAt AND :endCreatedAt`,
				{
					startCreatedAt,
					endCreatedAt,
				},
			);
		}

		if (startUpdatedAt && endUpdatedAt) {
			queryBuilder.andWhere(
				`trackType.updatedAt BETWEEN :startUpdatedAt AND :endUpdatedAt`,
				{
					startUpdatedAt,
					endUpdatedAt,
				},
			);
		}

		queryBuilder.orderBy(`trackType.${fieldOrder}`, orderBy);
		queryBuilder.skip(skip).take(pageSize);

		return queryBuilder;
	}

	async findOneWithCountRelation(id: string) {
		return await this.trackTypeRepo
			.createQueryBuilder('trackType')
			.where('trackType.id = :id', { id })
			.loadRelationCountAndMap(
				'trackType.tracksCount',
				'trackType.tracks',
			)
			.getOne();
	}
}
