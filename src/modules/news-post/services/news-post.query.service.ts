import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/common.response.dto';
import { NewsCategory } from 'src/modules/news-category/entities/news-category.entity';
import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';
import { NewsPostResponse } from '../constants/news-post.constant';
import { QueryGetListNewsPostDto } from '../dto/news-post.dto';
import { NewsPost } from '../entities/news-post.entity';
import { NewsPostStatus } from '../enum/news-post.enum';

@Injectable()
export class NewsPostQueryService {
	constructor(
		@InjectRepository(NewsPost)
		private readonly newsPostRepo: Repository<NewsPost>,
		@InjectRepository(NewsCategory)
		private readonly newsCategoryRepo: Repository<NewsCategory>,
	) {}

	async getList(query: QueryGetListNewsPostDto) {
		const qb = this.createQueryGetList(query);
		const [items, totalItems] = await qb.getManyAndCount();
		return { items, totalItems };
	}

	async getListPublic(query: QueryGetListNewsPostDto) {
		const qb = this.createQueryGetListPublic(query);
		const [items, totalItems] = await qb.getManyAndCount();
		return { items, totalItems };
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
			if (exist) throw new ResponseError(NewsPostResponse.DUPLICATE_SLUG);
		}

		if (newsCategoryId) {
			const exist = await this.newsCategoryRepo.findOne({
				where: { id: newsCategoryId },
			});
			if (!exist)
				throw new ResponseError(NewsPostResponse.CATEGORY_NOT_FOUND);
		}
	}

	// private
	private createBaseQb() {
		return this.newsPostRepo.createQueryBuilder('newsPost');
	}

	private createQueryGetList(filter: QueryGetListNewsPostDto) {
		const qb = this.createBaseQb();

		this.leftJoinNewsCategory(qb);
		this.leftJoinThumbnail(qb);

		this.applyFilter({ qb, filter });

		this.selectNewsPost(qb);
		this.addSelectNewsCategory(qb);

		return qb;
	}

	private createQueryGetListPublic(filter: QueryGetListNewsPostDto) {
		const qb = this.createQueryGetList(filter);
		this.andWhereStatusPublic(qb);
		return qb;
	}

	private leftJoinNewsCategory(qb: SelectQueryBuilder<NewsPost>) {
		const property = 'newsPost.newsCategory';
		const alias = 'newsCategory';

		this.leftJoinSafe({ qb, property, alias });
	}

	private leftJoinThumbnail(qb: SelectQueryBuilder<NewsPost>) {
		const property = 'newsPost.thumbnail';
		const alias = 'thumbnail';

		return this.leftJoinSafe({ qb, property, alias });
	}

	private applyFilter({
		filter,
		qb,
	}: {
		filter: QueryGetListNewsPostDto;
		qb: SelectQueryBuilder<NewsPost>;
	}) {
		const {
			keyword,
			skip,
			pageSize,
			fieldOrder,
			orderBy,
			status,
			newsCategoryId,
		} = filter;

		this.andWhereKeyword({ qb, keyword });
		this.andWhereStatus({ qb, status });
		this.andWhereNewsCategoryId({ qb, newsCategoryId });

		qb.orderBy(fieldOrder, orderBy);
		qb.skip(skip).take(pageSize);

		return qb;
	}

	private andWhereKeyword({
		keyword,
		qb,
	}: {
		keyword: QueryGetListNewsPostDto['keyword'];
		qb: SelectQueryBuilder<NewsPost>;
	}) {
		if (keyword) {
			qb.andWhere(
				new Brackets((qb1) => {
					qb1.where('newsPost.titleVi ILIKE :keyword')
						.orWhere('newsPost.titleEn ILIKE :keyword')
						.orWhere('newsPost.slug ILIKE :keyword');
				}),
				{ keyword: `%${keyword}%` },
			);
		}

		return qb;
	}

	private andWhereStatus({
		status,
		qb,
	}: {
		status: QueryGetListNewsPostDto['status'];
		qb: SelectQueryBuilder<NewsPost>;
	}) {
		if (status) {
			qb.andWhere('newsPost.status = :status', { status });
		}

		return qb;
	}

	private andWhereNewsCategoryId({
		newsCategoryId,
		qb,
	}: {
		newsCategoryId: QueryGetListNewsPostDto['newsCategoryId'];
		qb: SelectQueryBuilder<NewsPost>;
	}) {
		if (newsCategoryId) {
			qb.andWhere('newsPost.newsCategoryId = :newsCategoryId', {
				newsCategoryId,
			});
		}

		return qb;
	}

	private andWhereStatusPublic(qb: SelectQueryBuilder<NewsPost>) {
		this.andWhereStatus({ qb, status: NewsPostStatus.PUBLIC });
		return qb;
	}

	private selectNewsPost(qb: SelectQueryBuilder<NewsPost>) {
		qb.select([
			'newsPost.id',
			'newsPost.titleVi',
			'newsPost.titleEn',
			'newsPost.descriptionVi',
			'newsPost.descriptionEn',
			'newsPost.contentVi',
			'newsPost.contentEn',
			'newsPost.thumbnailId',
			'newsPost.status',
			'newsPost.newsCategoryId',
			'newsPost.slug',
			'newsPost.keywords',
			'newsPost.createdAt',
		]);

		return qb;
	}

	private addSelectNewsCategory(qb: SelectQueryBuilder<NewsPost>) {
		this.leftJoinNewsCategory(qb);

		qb.addSelect([
			'newsCategory.id',
			'newsCategory.nameVi',
			'newsCategory.nameEn',
			'newsCategory.descriptionVi',
			'newsCategory.descriptionEn',
			'newsCategory.createdAt',
		]);

		return qb;
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

		return qb;
	}
}
