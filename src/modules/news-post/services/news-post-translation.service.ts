import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/common.response.dto';
import { Language } from 'src/modules/language/entities/language.entity';
import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';
import { NewsPostTranslationResponseError } from '../constants/news-post-translation.constant';
import {
	CreateNewsPostTranslationDto,
	GetListNewsPostTranslations,
	UpdateNewsPostTranslationDto,
} from '../dto/news-post-translation.dto';
import { NewsPostTranslation } from '../entities/news-post-translation.entity';

@Injectable()
export class NewsPostTranslationService {
	private responseError = NewsPostTranslationResponseError;

	constructor(
		@InjectRepository(NewsPostTranslation)
		private readonly newsPostTranslationRepo: Repository<NewsPostTranslation>,

		@InjectRepository(Language)
		private readonly languageRepo: Repository<Language>,
	) {}

	async create(
		input: CreateNewsPostTranslationDto,
	): Promise<NewsPostTranslation> {
		const {
			newsPostId,
			languageCode,
			title,
			description,
			content,
			isDefault,
			userId,
		} = input;

		await this.validateDataCreate(input);

		if (isDefault) {
			await this.disableTranslationsDefaultOfNewPost(newsPostId);
		}

		const entity = this.newsPostTranslationRepo.create({
			newsPostId,
			languageCode,
			title,
			description,
			content,
			isDefault: isDefault ?? false,
			creatorId: userId,
			modifierId: userId,
		});

		return await this.newsPostTranslationRepo.save(entity);
	}

	async findOne(id: string) {
		const entity = await this.newsPostTranslationRepo.findOne({
			where: { id },
		});

		if (!entity) {
			throw new ResponseError(this.responseError.NOT_FOUND);
		}

		return entity;
	}

	async getList(filter: GetListNewsPostTranslations) {
		const { page, pageSize, fieldOrder, orderBy } = filter;

		const qb = this.createBaseQb();
		this.leftJoinLanguage(qb);
		this.leftJoinUserTracked(qb);

		this.applyFilter({ qb, filter });
		qb.orderBy(fieldOrder, orderBy);

		const [items, totalItems] = await qb.getManyAndCount();

		return new PageDto({
			items,
			metadata: { totalItems, pageSize, currentPage: page },
		});
	}

	async listOfNewsPost(query: GetListNewsPostTranslations) {
		const { newsPostId, orderBy, fieldOrder } = query;

		const qb = this.createBaseQb();
		this.leftJoinLanguage(qb);
		this.leftJoinUserTracked(qb);

		this.andWhereNewsPostId({ qb, newsPostId });

		this.addSelectLanguage(qb);
		this.addSelectCreator(qb);
		this.addSelectModifier(qb);
		qb.orderBy(fieldOrder, orderBy);

		const entities = await qb.getMany();

		return entities.map((item) => this.assigneLanguageNameOne(item));
	}

	async update(id: string, data: UpdateNewsPostTranslationDto) {
		const { isDefault } = data;

		const translationDb = await this.findOne(id);
		await this.validateDataUpdate({ translationDb, dataUpdate: data });

		if (!translationDb.isDefault && isDefault) {
			await this.disableTranslationsDefaultOfNewPost(
				translationDb.newsPostId,
			);
		}

		const { userId, ...rest } = data;
		await this.newsPostTranslationRepo.update(id, {
			...rest,
			modifierId: userId,
		});

		return await this.findOne(id);
	}

	async delete(id: string) {
		const entity = await this.findOne(id);

		if (entity.isDefault) {
			throw new ResponseError(this.responseError.CANNOT_DELETE_DEFAULT);
		}

		await this.newsPostTranslationRepo.delete({ id });
	}

	// helper method
	private async disableTranslationsDefaultOfNewPost(newsPostId: string) {
		await this.newsPostTranslationRepo.update(
			{ newsPostId },
			{ isDefault: false },
		);
	}

	private assigneLanguageNameOne(
		entity: NewsPostTranslation,
	): NewsPostTranslation {
		const { language } = entity;

		entity.language = undefined;
		entity.languageName = language?.name;

		return entity;
	}

	// validate method
	private async validateDataCreate({
		newsPostId,
		languageCode,
	}: CreateNewsPostTranslationDto) {
		await Promise.all([
			this.ensureLanguageCodeExists(languageCode),
			this.ensureNotUnique({ newsPostId, languageCode }),
		]);
	}

	private async validateDataUpdate({
		translationDb,
		dataUpdate,
	}: {
		translationDb: NewsPostTranslation;
		dataUpdate: UpdateNewsPostTranslationDto;
	}) {
		const { isDefault, languageCode } = dataUpdate;

		if (isDefault === false && translationDb.isDefault) {
			throw new ResponseError(this.responseError.MUST_HAVE_ONE_DEFAULT);
		}

		if (languageCode && languageCode !== translationDb.languageCode) {
			await this.ensureNotUnique({
				languageCode,
				newsPostId: translationDb.newsPostId,
			});
		}
	}

	private async ensureLanguageCodeExists(languageCode?: string) {
		if (languageCode) {
			const entity = await this.languageRepo.findOne({
				where: { code: languageCode },
			});

			if (!entity) {
				throw new ResponseError(this.responseError.LANGUAGE_NOT_FOUND);
			}
		}
	}

	private async ensureNotUnique({
		newsPostId,
		languageCode,
	}: {
		newsPostId: string;
		languageCode: string;
	}) {
		const isExists = await this.newsPostTranslationRepo.findOne({
			where: { newsPostId, languageCode },
		});

		if (isExists) {
			throw new ResponseError(this.responseError.UNIQUE_CONSTRAINT);
		}
	}

	// query service
	private createBaseQb() {
		return this.newsPostTranslationRepo.createQueryBuilder(
			'newsPostTranslation',
		);
	}

	private leftJoinUserTracked(qb: SelectQueryBuilder<NewsPostTranslation>) {
		this.leftJoinCreator(qb);
		this.leftJoinModifier(qb);
	}

	private leftJoinCreator(qb: SelectQueryBuilder<NewsPostTranslation>) {
		const property = 'newsPostTranslation.creator';
		const alias = 'creator';

		this.leftJoinSafe({ qb, property, alias });
	}

	private leftJoinModifier(qb: SelectQueryBuilder<NewsPostTranslation>) {
		const property = 'newsPostTranslation.modifier';
		const alias = 'modifier';

		this.leftJoinSafe({ qb, property, alias });
	}

	private leftJoinLanguage(qb: SelectQueryBuilder<NewsPostTranslation>) {
		const property = 'newsPostTranslation.language';
		const alias = 'language';

		qb.leftJoin(property, alias);
	}

	private addSelectLanguage(qb: SelectQueryBuilder<NewsPostTranslation>) {
		qb.addSelect(['language.id', 'language.name', 'language.code']);
	}

	private addSelectCreator(qb: SelectQueryBuilder<NewsPostTranslation>) {
		this.leftJoinCreator(qb);
		qb.addSelect(['creator.id', 'creator.name', 'creator.email']);
	}

	private addSelectModifier(qb: SelectQueryBuilder<NewsPostTranslation>) {
		this.leftJoinModifier(qb);
		qb.addSelect(['modifier.id', 'modifier.name', 'modifier.email']);
	}

	private leftJoinSafe({
		qb,
		property,
		alias,
	}: {
		qb: SelectQueryBuilder<NewsPostTranslation>;
		property: string;
		alias: string;
	}) {
		const isJoined = qb.expressionMap.joinAttributes.some(
			(j) => j.alias?.name === alias,
		);

		if (!isJoined) {
			qb.leftJoin(property, alias);
		}
	}

	private applyFilter({
		filter,
		qb,
	}: {
		filter: GetListNewsPostTranslations;
		qb: SelectQueryBuilder<NewsPostTranslation>;
	}) {
		const { isDefault, newsPostId, keyword, startCreatedAt, endCreatedAt } =
			filter;

		this.andWhereKeyword({ qb, keyword });
		this.andWhereIsDefault({ qb, isDefault });
		this.andWhereNewsPostId({ qb, newsPostId });
		this.andWhereCreatedAt({ qb, startCreatedAt, endCreatedAt });
	}

	private andWhereKeyword({
		keyword,
		qb,
	}: {
		keyword: GetListNewsPostTranslations['keyword'];
		qb: SelectQueryBuilder<NewsPostTranslation>;
	}) {
		if (keyword) {
			qb.andWhere(
				new Brackets((qb1) => {
					qb1.where('newsPostTranslation.title ILIKE :keyword')
						.orWhere(
							'newsPostTranslation.languageCode ILIKE :keyword',
						)
						.orWhere(
							'newsPostTranslation.description ILIKE :keyword',
						)
						.orWhere('newsPostTranslation.content ILIKE :keyword');
				}),
				{ keyword: `%${keyword}%` },
			);
		}
	}

	private andWhereCreatedAt({
		startCreatedAt,
		endCreatedAt,
		qb,
	}: {
		startCreatedAt: GetListNewsPostTranslations['startCreatedAt'];
		endCreatedAt: GetListNewsPostTranslations['endCreatedAt'];
		qb: SelectQueryBuilder<NewsPostTranslation>;
	}) {
		if (startCreatedAt && endCreatedAt) {
			qb.andWhere(
				`newsPostTranslation.createdAt BETWEEN :startCreatedAt AND :endCreatedAt`,
				{
					startCreatedAt,
					endCreatedAt,
				},
			);
		}
	}

	private andWhereNewsPostId({
		newsPostId,
		qb,
	}: {
		newsPostId: GetListNewsPostTranslations['newsPostId'];
		qb: SelectQueryBuilder<NewsPostTranslation>;
	}) {
		if (newsPostId) {
			qb.andWhere('newsPostTranslation.newsPostId = :newsPostId', {
				newsPostId,
			});
		}
	}

	private andWhereIsDefault({
		isDefault,
		qb,
	}: {
		isDefault: GetListNewsPostTranslations['isDefault'];
		qb: SelectQueryBuilder<NewsPostTranslation>;
	}) {
		if (isDefault) {
			qb.andWhere('newsPostTranslation.isDefault = :isDefault', {
				isDefault,
			});
		}
	}
}
