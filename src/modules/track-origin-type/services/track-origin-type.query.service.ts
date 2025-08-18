import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import {
	TrackOriginTypeMessageCodeError,
	TrackOriginTypeMessageError,
} from '../constants/track-origin-type.constant';
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

	async validate({ name, code }: { name?: string; code?: string }) {
		if (name) {
			const trackOriginType = await this.trackOriginTypeRepo.findOne({
				where: { name },
			});

			if (trackOriginType) {
				throw new ResponseError({
					messageCode:
						TrackOriginTypeMessageCodeError.DUPLICATE_NAME_TRACK_ORIGIN_TYPE,
					message:
						TrackOriginTypeMessageError.DUPLICATE_NAME_TRACK_ORIGIN_TYPE,
				});
			}
		}

		if (code) {
			const trackOriginType = await this.trackOriginTypeRepo.findOne({
				where: { code },
			});

			if (trackOriginType) {
				throw new ResponseError({
					messageCode:
						TrackOriginTypeMessageCodeError.DUPLICATE_CODE_TRACK_ORIGIN_TYPE,
					message:
						TrackOriginTypeMessageError.DUPLICATE_CODE_TRACK_ORIGIN_TYPE,
				});
			}
		}
	}

	validateDelete(trackOriginType: TrackOriginType) {
		if (!trackOriginType) {
			throw new ResponseError({
				message: TrackOriginTypeMessageError.NOT_FOUND,
				statusCode: 404,
			});
		}

		if ((trackOriginType.tracksCount ?? 0) > 0) {
			throw new ResponseError({
				message:
					TrackOriginTypeMessageError.CANNOT_DELETE_BECAUSE_LINKED_TRACKS,
				messageCode:
					TrackOriginTypeMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_TRACKS,
				statusCode: 400,
			});
		}
	}
}
