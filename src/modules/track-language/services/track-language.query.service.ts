import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import { TrackLanguage } from '../entities/track-language.entity';

@Injectable()
export class TrackLanguageQueryService {
	private mainAlias: string;

	constructor(
		@InjectRepository(TrackLanguage)
		private readonly trackLanguageRepo: Repository<TrackLanguage>,
	) {
		this.mainAlias = 'trackLanguage';
	}

	public getMainAlias() {
		return this.mainAlias;
	}

	// createQueryGetList(query: QueryGetListTrackLanguageDto) {
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

	// 	const queryBuilder = this.trackLanguageRepo.createQueryBuilder(
	// 		this.mainAlias,
	// 	);
	// 	queryBuilder.leftJoinAndSelect(
	// 		'trackLanguage.audioFile',
	// 		'audioFile',
	// 	);

	// 	if (keyword) {
	// 		queryBuilder.andWhere('trackLanguage.title ILIKE :keyword', {
	// 			keyword: `%${keyword}%`,
	// 		});
	// 	}

	// 	if (startCreatedAt && endCreatedAt) {
	// 		queryBuilder.andWhere(
	// 			`trackLanguage.createdAt BETWEEN :startCreatedAt AND :endCreatedAt`,
	// 			{
	// 				startCreatedAt,
	// 				endCreatedAt,
	// 			},
	// 		);
	// 	}

	// 	if (startUpdatedAt && endUpdatedAt) {
	// 		queryBuilder.andWhere(
	// 			`trackLanguage.updatedAt BETWEEN :startUpdatedAt AND :endUpdatedAt`,
	// 			{
	// 				startUpdatedAt,
	// 				endUpdatedAt,
	// 			},
	// 		);
	// 	}

	// 	queryBuilder.orderBy(`trackLanguage.${fieldOrder}`, orderBy);
	// 	queryBuilder.skip(skip).take(pageSize);

	// 	return queryBuilder;
	// }

	async findOne(id: string): Promise<TrackLanguage> {
		const trackLanguage = await this.trackLanguageRepo.findOne({
			where: { id },
		});

		if (!trackLanguage) {
			throw new ResponseError({
				message: 'Not found track language',
				statusCode: 404,
			});
		}

		return trackLanguage;
	}
}
