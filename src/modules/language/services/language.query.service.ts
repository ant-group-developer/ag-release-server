import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import { LanguageMessage } from '../constants/language.constant';
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

	async validate({ name, code }: { name?: string; code?: string }) {
		if (name) {
			const language = await this.languageRepo.findOne({
				where: { name },
			});

			if (language) {
				throw new ResponseError(
					LanguageMessage.DUPLICATE_NAME_LANGUAGE,
				);
			}
		}

		if (code) {
			const language = await this.languageRepo.findOne({
				where: { code },
			});

			if (language) {
				throw new ResponseError(
					LanguageMessage.DUPLICATE_CODE_LANGUAGE,
				);
			}
		}
	}

	validateDelete(language: Language) {
		if ((language.releaseLocalizesCount ?? 0) > 0) {
			throw new ResponseError(
				LanguageMessage.CANNOT_DELETE_BECAUSE_LINKED_RELEASE_LOCALIZES,
			);
		}

		if ((language.releaseAudiolanguagesCount ?? 0) > 0) {
			throw new ResponseError(
				LanguageMessage.CANNOT_DELETE_BECAUSE_LINKED_RELEASE_AUDIO_LANGUAGES,
			);
		}

		if ((language.releaseMetadataLanguagesCount ?? 0) > 0) {
			throw new ResponseError(
				LanguageMessage.CANNOT_DELETE_BECAUSE_LINKED_RELEASE_METADATA_LANGUAGES,
			);
		}

		if ((language.trackAudioLanguagesCount ?? 0) > 0) {
			throw new ResponseError(
				LanguageMessage.CANNOT_DELETE_BECAUSE_LINKED_TRACK_AUDIO_LANGUAGES,
			);
		}

		if ((language.trackMetadataLanguagesCount ?? 0) > 0) {
			throw new ResponseError(
				LanguageMessage.CANNOT_DELETE_BECAUSE_LINKED_TRACK_METADATA_LANGUAGES,
			);
		}

		if ((language.trackLocalizesCount ?? 0) > 0) {
			throw new ResponseError(
				LanguageMessage.CANNOT_DELETE_BECAUSE_LINKED_TRACK_LOCALIZES,
			);
		}
	}
}
