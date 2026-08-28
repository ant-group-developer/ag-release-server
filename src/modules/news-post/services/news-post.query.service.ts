import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/common.response.dto';
import { NewsCategory } from 'src/modules/news-category/entities/news-category.entity';
import { ALL_NEWS_CATEGORY_FIELDS_SIMPLE } from 'src/modules/orm/filed-mappings/orm.news-category';
import {
	ALL_NEWS_POST_TRANSLATION_FILEDS_SIMPLE,
	NewsPostTransLationFieldsSimple,
} from 'src/modules/orm/filed-mappings/orm.news-post-translation';
import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';
import { NewsPostResponseError } from '../constants/news-post.constant';
import { QueryGetListNewsPostDto } from '../dto/news-post.dto';
import { NewsPost } from '../entities/news-post.entity';
import { NewsPostStatus } from '../enum/news-post.enum';

@Injectable()
export class NewsPostQueryService {
	private readonly responseError = NewsPostResponseError;

	constructor(
		@InjectRepository(NewsPost)
		private readonly newsPostRepo: Repository<NewsPost>,
		@InjectRepository(NewsCategory)
		private readonly newsCategoryRepo: Repository<NewsCategory>,
	) {}

	async getList(
		query: QueryGetListNewsPostDto,
		isSystemAdmin: boolean = false,
	) {
		const qb = this.createQueryGetList(query, isSystemAdmin);
		const [items, totalItems] = await qb.getManyAndCount();
		return { items, totalItems };
	}

	async getListPublic(query: QueryGetListNewsPostDto) {
		const qb = this.createQueryGetListPublic(query);
		const [items, totalItems] = await qb.getManyAndCount();
		return { items, totalItems };
	}

	async findOneWithRelations(id: string) {
		const qb = this.createQueryFindOneWithRelations(id);
		return await qb.getOne();
	}

	async findOnePublic(slug: string) {
		const qb = this.createQueryFindOnePublic(slug);
		return await qb.getOne();
	}

	async validate({
		slug,
		newsCategoryId,
	}: {
		slug?: string;
		newsCategoryId?: string;
	}) {
		if (slug) {
			const exist = await this.newsPostRepo.findOne({ where: { slug } });
			if (exist)
				throw new ResponseError(this.responseError.DUPLICATE_SLUG);
		}

		if (newsCategoryId) {
			const exist = await this.newsCategoryRepo.findOne({
				where: { id: newsCategoryId },
			});
			if (!exist)
				throw new ResponseError(this.responseError.CATEGORY_NOT_FOUND);
		}
	}

	async getKeywords() {
		const qb = this.newsPostRepo.manager
			.createQueryBuilder()
			.select('unnest(newsPost.keywords)', 'keyword')
			.from(NewsPost, 'newsPost')
			.groupBy('keyword');

		const dataRaw = await qb.getRawMany<{ keyword: string }>();

		return dataRaw
			.map((i) => i.keyword)
			.filter(Boolean)
			.sort((a, b) => a.localeCompare(b));
	}

	// private
	private createBaseQb() {
		return this.newsPostRepo.createQueryBuilder('newsPost');
	}

	private createQueryGetList(
		filter: QueryGetListNewsPostDto,
		isSystemAdmin: boolean = false,
	) {
		const qb = this.createBaseQb();

		this.leftJoinNewsCategory(qb);
		this.leftJoinNewsPostTranslation(qb);
		this.leftJoinLanguage(qb);
		this.leftJoinUserTracked(qb);

		this.applyFilter({ qb, filter, isSystemAdmin });

		this.selectNewsPost(qb);
		this.addSelectNewsCategory({ qb });
		this.addSelectNewsPostTranslation({
			qb,
			select: [
				NewsPostTransLationFieldsSimple.ID,
				NewsPostTransLationFieldsSimple.NEWS_POST_ID,
				NewsPostTransLationFieldsSimple.LANGUAGE_CODE,
				NewsPostTransLationFieldsSimple.TITLE,
				NewsPostTransLationFieldsSimple.DESCRIPTION,
				NewsPostTransLationFieldsSimple.IS_DEFAULT,
			],
		});
		this.addSelectLanguage(qb);
		this.addSelectUserTracked(qb);

		return qb;
	}

	private createQueryFindOneWithRelations(id: string) {
		const qb = this.createBaseQb();

		this.leftJoinNewsCategory(qb);
		this.leftJoinNewsPostTranslation(qb);
		this.leftJoinLanguage(qb);
		this.leftJoinUserTracked(qb);

		this.andWhereId({ qb, id });

		this.selectNewsPost(qb);
		this.addSelectNewsCategory({ qb });
		this.addSelectNewsPostTranslation({ qb });
		this.addSelectLanguage(qb);

		return qb;
	}

	private createQueryFindOnePublic(slug: string) {
		const qb = this.createBaseQb();

		this.leftJoinNewsCategory(qb);
		this.leftJoinNewsPostTranslation(qb);
		this.leftJoinLanguage(qb);
		this.leftJoinUserTracked(qb);

		this.andWhereSlug({ qb, slug });

		this.selectNewsPost(qb);
		this.addSelectNewsCategory({ qb });
		this.addSelectNewsPostTranslation({ qb });
		this.addSelectLanguage(qb);

		return qb;
	}

	private createQueryGetListPublic(filter: QueryGetListNewsPostDto) {
		const qb = this.createQueryGetList(filter, false);
		return qb;
	}

	private leftJoinNewsCategory(qb: SelectQueryBuilder<NewsPost>) {
		const property = 'newsPost.newsCategory';
		const alias = 'newsCategory';

		this.leftJoinSafe({ qb, property, alias });
	}

	private leftJoinUserTracked(qb: SelectQueryBuilder<NewsPost>) {
		this.leftJoinCreator(qb);
		this.leftJoinModifier(qb);
	}

	private leftJoinCreator(qb: SelectQueryBuilder<NewsPost>) {
		const property = 'newsPost.creator';
		const alias = 'creator';

		this.leftJoinSafe({ qb, property, alias });
	}

	private leftJoinModifier(qb: SelectQueryBuilder<NewsPost>) {
		const property = 'newsPost.modifier';
		const alias = 'modifier';

		this.leftJoinSafe({ qb, property, alias });
	}

	private leftJoinNewsPostTranslation(qb: SelectQueryBuilder<NewsPost>) {
		const property = 'newsPost.newsPostTranslations';
		const alias = 'newsPostTranslation';

		this.leftJoinSafe({ qb, property, alias });
	}

	private leftJoinLanguage(qb: SelectQueryBuilder<NewsPost>) {
		const property = 'newsPostTranslation.language';
		const alias = 'language';

		qb.leftJoin(property, alias);
	}

	private addSelectUserTracked(qb: SelectQueryBuilder<NewsPost>) {
		this.leftJoinUserTracked(qb);

		this.addSelectCreator(qb);
		this.addSelectModifier(qb);
	}

	private addSelectCreator(qb: SelectQueryBuilder<NewsPost>) {
		this.leftJoinCreator(qb);
		qb.addSelect(['creator.id', 'creator.name', 'creator.email']);
	}

	private addSelectModifier(qb: SelectQueryBuilder<NewsPost>) {
		this.leftJoinModifier(qb);
		qb.addSelect(['modifier.id', 'modifier.name', 'modifier.email']);
	}

	private addSelectLanguage(qb: SelectQueryBuilder<NewsPost>) {
		qb.addSelect(['language.id', 'language.name', 'language.code']);
	}

	private applyFilter({
		filter,
		qb,
		isSystemAdmin = false,
	}: {
		filter: QueryGetListNewsPostDto;
		qb: SelectQueryBuilder<NewsPost>;
		isSystemAdmin?: boolean;
	}) {
		const {
			keyword,
			keywords,
			skip,
			pageSize,
			fieldOrder,
			orderBy,
			status,
			newsCategoryId,
			title,

			startCreatedAt,
			endCreatedAt,
		} = filter;

		this.andWhereKeyword({ qb, keyword });
		this.andWhereKeywords({ qb, keywords });
		this.andWhereTitle({ qb, title });
		this.andWhereCreatedAt({ qb, startCreatedAt, endCreatedAt });

		if (isSystemAdmin) {
			this.andWhereStatus({ qb, status });
		} else {
			this.andWhereStatusPublic(qb);
		}

		this.andWhereNewsCategoryId({ qb, newsCategoryId });

		qb.orderBy(fieldOrder, orderBy);
		qb.skip(skip).take(pageSize);
	}

	private andWhereId({
		id,
		qb,
	}: {
		id?: string;
		qb: SelectQueryBuilder<NewsPost>;
	}) {
		if (id) {
			qb.where('newsPost.id = :id', { id });
		}
	}

	private andWhereSlug({
		slug,
		qb,
	}: {
		slug?: string;
		qb: SelectQueryBuilder<NewsPost>;
	}) {
		if (slug) {
			qb.where('newsPost.slug = :slug', { slug });
		}
	}

	private andWhereKeyword({
		keyword,
		qb,
	}: {
		keyword: QueryGetListNewsPostDto['keyword'];
		qb: SelectQueryBuilder<NewsPost>;
	}) {
		if (keyword) {
			this.leftJoinNewsPostTranslation(qb);

			qb.andWhere(
				new Brackets((qb1) => {
					qb1.where(
						'newsPostTranslation.title ILIKE :keyword',
					).orWhere('newsPost.slug ILIKE :keyword');
				}),
				{ keyword: `%${keyword}%` },
			);
		}
	}

	private andWhereTitle({
		title,
		qb,
	}: {
		title: QueryGetListNewsPostDto['title'];
		qb: SelectQueryBuilder<NewsPost>;
	}) {
		if (title && title.length > 0) {
			this.leftJoinNewsPostTranslation(qb);

			qb.andWhere(
				new Brackets((qb1) => {
					title.forEach((t, idx) => {
						const param = `title${idx}`;
						const clause = `newsPostTranslation.title ILIKE :${param}`;

						if (idx === 0) {
							qb1.where(clause, { [param]: `%${t}%` });
						} else {
							qb1.orWhere(clause, { [param]: `%${t}%` });
						}
					});
				}),
			);
		}
	}

	private andWhereCreatedAt({
		startCreatedAt,
		endCreatedAt,
		qb,
	}: {
		startCreatedAt: QueryGetListNewsPostDto['startCreatedAt'];
		endCreatedAt: QueryGetListNewsPostDto['endCreatedAt'];
		qb: SelectQueryBuilder<NewsPost>;
	}) {
		if (startCreatedAt && endCreatedAt) {
			qb.andWhere(
				`newsPost.createdAt BETWEEN :startCreatedAt AND :endCreatedAt`,
				{
					startCreatedAt,
					endCreatedAt,
				},
			);
		}
	}

	private andWhereKeywords({
		keywords,
		qb,
	}: {
		keywords: QueryGetListNewsPostDto['keywords'];
		qb: SelectQueryBuilder<NewsPost>;
	}) {
		if (keywords && keywords.length > 0) {
			qb.andWhere(
				new Brackets((qb1) => {
					keywords.forEach((kw, idx) => {
						const param = `keyword${idx}`;
						const clause = `:${param} = ANY(newsPost.keywords)`;

						if (idx === 0) {
							qb1.where(clause, { [param]: kw });
						} else {
							qb1.orWhere(clause, { [param]: kw });
						}
					});
				}),
			);
		}
	}

	private andWhereStatus({
		status,
		qb,
	}: {
		status: QueryGetListNewsPostDto['status'];
		qb: SelectQueryBuilder<NewsPost>;
	}) {
		if (status && status.length > 0) {
			qb.andWhere('newsPost.status IN (:...status)', { status });
		}
	}

	private andWhereNewsCategoryId({
		newsCategoryId,
		qb,
	}: {
		newsCategoryId: QueryGetListNewsPostDto['newsCategoryId'];
		qb: SelectQueryBuilder<NewsPost>;
	}) {
		if (newsCategoryId && newsCategoryId.length > 0) {
			qb.andWhere('newsPost.newsCategoryId IN (:...newsCategoryId)', {
				newsCategoryId,
			});
		}
	}

	private andWhereStatusPublic(qb: SelectQueryBuilder<NewsPost>) {
		this.andWhereStatus({ qb, status: [NewsPostStatus.PUBLIC] });
	}

	private selectNewsPost(qb: SelectQueryBuilder<NewsPost>) {
		qb.select([
			'newsPost.id',
			'newsPost.thumbnail',
			'newsPost.status',
			'newsPost.newsCategoryId',
			'newsPost.slug',
			'newsPost.keywords',
			'newsPost.createdAt',
			'newsPost.updatedAt',
		]);
	}

	private addSelectNewsCategory({
		qb,
		select,
	}: {
		qb: SelectQueryBuilder<NewsPost>;
		select?: string[];
	}) {
		this.leftJoinNewsCategory(qb);

		if (select && select.length > 0) {
			qb.addSelect(select.map((i) => i));
		} else {
			qb.addSelect(ALL_NEWS_CATEGORY_FIELDS_SIMPLE);
		}
	}

	private addSelectNewsPostTranslation({
		qb,
		select,
	}: {
		qb: SelectQueryBuilder<NewsPost>;
		select?: string[];
	}) {
		this.leftJoinNewsPostTranslation(qb);

		if (select && select.length > 0) {
			qb.addSelect(select.map((i) => i));
		} else {
			qb.addSelect(ALL_NEWS_POST_TRANSLATION_FILEDS_SIMPLE);
		}
	}

	private leftJoinSafe({
		qb,
		property,
		alias,
	}: {
		qb: SelectQueryBuilder<NewsPost | NewsCategory>;
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
}
