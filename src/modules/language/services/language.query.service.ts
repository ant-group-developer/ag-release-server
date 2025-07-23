import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryGetListLanguageDto } from '../dto/language.dto';
import { Language } from '../entities/language.entity';

@Injectable()
export class LanguageQueryService {
	constructor(
		@InjectRepository(Language)
		private readonly languageRepo: Repository<Language>,
	) {}

	createQueryGetList(query: QueryGetListLanguageDto) {
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

		const queryBuilder = this.languageRepo.createQueryBuilder('language');

		if (keyword) {
			queryBuilder.andWhere('language.name ILIKE :keyword', {
				keyword: `%${keyword}%`,
			});
		}

		if (startCreatedAt && endCreatedAt) {
			queryBuilder.andWhere(
				`language.createdAt BETWEEN :startCreatedAt AND :endCreatedAt`,
				{
					startCreatedAt,
					endCreatedAt,
				},
			);
		}

		if (startUpdatedAt && endUpdatedAt) {
			queryBuilder.andWhere(
				`language.updatedAt BETWEEN :startUpdatedAt AND :endUpdatedAt`,
				{
					startUpdatedAt,
					endUpdatedAt,
				},
			);
		}

		queryBuilder.orderBy(`language.${fieldOrder}`, orderBy);
		queryBuilder.skip(skip).take(pageSize);

		return queryBuilder;
	}

	async findOneWithCountRelation(id: string) {
		const queryBuilder = this.languageRepo
			.createQueryBuilder('language')
			.where('language.id = :id', { id })

			.loadRelationCountAndMap(
				'language.releaseLocalizesCount',
				'language.releaseLocalizes',
			)
			.loadRelationCountAndMap(
				'language.releaseAudiolanguagesCount',
				'language.releaseAudiolanguages',
			)

			.loadRelationCountAndMap(
				'language.releaseMetadataLanguagesCount',
				'language.releaseMetadataLanguages',
			)

			.loadRelationCountAndMap(
				'language.trackAudioLanguagesCount',
				'language.trackAudioLanguages',
			)
			.loadRelationCountAndMap(
				'language.trackMetadataLanguagesCount',
				'language.trackMetadataLanguages',
			)
			.loadRelationCountAndMap(
				'language.trackLocalizesCount',
				'language.trackLocalizes',
			);

		return await queryBuilder.getOne();
	}
}
