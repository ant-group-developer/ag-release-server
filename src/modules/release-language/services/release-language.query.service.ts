import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import { ReleaseLanguage } from '../entities/release-language.entity';

@Injectable()
export class ReleaseLanguageQueryService {
	private mainAlias: string;

	constructor(
		@InjectRepository(ReleaseLanguage)
		private readonly releaseLanguageRepo: Repository<ReleaseLanguage>,
	) {
		this.mainAlias = 'releaseLanguage';
	}

	public getMainAlias() {
		return this.mainAlias;
	}

	// createQueryGetList(query: QueryGetListReleaseLanguageDto) {
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

	// 	const queryBuilder = this.releaseLanguageRepo.createQueryBuilder(
	// 		this.mainAlias,
	// 	);
	// 	queryBuilder.leftJoinAndSelect(
	// 		'releaseLanguage.audioFile',
	// 		'audioFile',
	// 	);

	// 	if (keyword) {
	// 		queryBuilder.andWhere('releaseLanguage.title ILIKE :keyword', {
	// 			keyword: `%${keyword}%`,
	// 		});
	// 	}

	// 	if (startCreatedAt && endCreatedAt) {
	// 		queryBuilder.andWhere(
	// 			`releaseLanguage.createdAt BETWEEN :startCreatedAt AND :endCreatedAt`,
	// 			{
	// 				startCreatedAt,
	// 				endCreatedAt,
	// 			},
	// 		);
	// 	}

	// 	if (startUpdatedAt && endUpdatedAt) {
	// 		queryBuilder.andWhere(
	// 			`releaseLanguage.updatedAt BETWEEN :startUpdatedAt AND :endUpdatedAt`,
	// 			{
	// 				startUpdatedAt,
	// 				endUpdatedAt,
	// 			},
	// 		);
	// 	}

	// 	queryBuilder.orderBy(`releaseLanguage.${fieldOrder}`, orderBy);
	// 	queryBuilder.skip(skip).take(pageSize);

	// 	return queryBuilder;
	// }

	async findOne(id: string): Promise<ReleaseLanguage> {
		const releaseLanguage = await this.releaseLanguageRepo.findOne({
			where: { id },
		});

		if (!releaseLanguage) {
			throw new ResponseError({
				message: 'Not found release language',
				statusCode: 404,
			});
		}

		return releaseLanguage;
	}
}
