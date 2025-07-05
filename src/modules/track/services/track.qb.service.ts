import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import { TrackMessageError } from '../constants/track.constant';
import { Track } from '../entities/track.entity';

@Injectable()
export class TrackQbService {
	private mainAlias: string;

	constructor(
		@InjectRepository(Track)
		private readonly trackRepo: Repository<Track>,
	) {
		this.mainAlias = 'track';
	}

	public getMainAlias() {
		return this.mainAlias;
	}

	// createQueryGetList(query: QueryGetListTrackDto) {
	// 	const {
	// 		keyword,

	// 		startCreatedAt,
	// 		endCreatedAt,
	// 		startUpdatedAt,
	// 		endUpdatedAt,

	// 		fieldOrder,
	// 		orderBy,

	// 		skip,
	// 		pageSize,
	// 	} = query;

	// 	const queryBuilder = this.trackRepo.createQueryBuilder(this.mainAlias);

	// 	queryBuilder.leftJoinAndSelect('track.primaryGenre', 'primaryGenre');

	// 	if (keyword) {
	// 		queryBuilder.andWhere('track.title ILIKE :keyword', {
	// 			keyword: `%${keyword}%`,
	// 		});
	// 	}

	// 	if (startCreatedAt && endCreatedAt) {
	// 		queryBuilder.andWhere(
	// 			`track.createdAt BETWEEN :startCreatedAt AND :endCreatedAt`,
	// 			{
	// 				startCreatedAt,
	// 				endCreatedAt,
	// 			},
	// 		);
	// 	}

	// 	if (startUpdatedAt && endUpdatedAt) {
	// 		queryBuilder.andWhere(
	// 			`track.updatedAt BETWEEN :startUpdatedAt AND :endUpdatedAt`,
	// 			{
	// 				startUpdatedAt,
	// 				endUpdatedAt,
	// 			},
	// 		);
	// 	}

	// 	queryBuilder.orderBy(`track.${fieldOrder}`, orderBy);
	// 	queryBuilder.skip(skip).take(pageSize);

	// 	return queryBuilder;
	// }

	async findOne(id: string): Promise<Track> {
		const track = await this.trackRepo.findOne({
			where: { id },
		});

		if (!track) {
			throw new ResponseError({
				message: TrackMessageError.NOT_FOUND,
				statusCode: 404,
			});
		}

		return track;
	}

	async getDetail(id: string): Promise<Track> {
		const query = this.trackRepo.createQueryBuilder(this.mainAlias);

		query.where('track.id = :id', {
			id,
		});

		query.leftJoinAndSelect('track.trackCoverArt', 'trackCoverArt');

		const track = await query.getOne();

		if (!track) {
			throw new ResponseError({
				message: TrackMessageError.NOT_FOUND,
				statusCode: 404,
			});
		}

		return track;
	}
}
