import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import slugify from 'slugify';
import { PageDto, ResponseError } from 'src/common/dtos/common.response.dto';
import { getTimeStamp } from 'src/utils/util.date';
import { Repository } from 'typeorm';
import { NewsPostResponseError } from '../constants/news-post.constant';
import { GetListNewsPostTranslations } from '../dto/news-post-translation.dto';
import {
	AddTranslationNewsPostDto,
	CreateNewsPostDto,
	QueryGetListNewsPostDto,
	UpdateNewsPostDto,
} from '../dto/news-post.dto';
import { NewsPost } from '../entities/news-post.entity';
import { NewsPostTranslationService } from './news-post-translation.service';
import { NewsPostQueryService } from './news-post.query.service';

@Injectable()
export class NewsPostService {
	private readonly responseError = NewsPostResponseError;

	constructor(
		@InjectRepository(NewsPost)
		private readonly newsPostRepo: Repository<NewsPost>,

		private readonly newsPostQueryService: NewsPostQueryService,
		private readonly newsPostTranslationService: NewsPostTranslationService,
	) {}

	async handleCreate(data: CreateNewsPostDto, userId: string) {
		const { content, title, description, languageCode } = data;

		const newsPost = await this.create(data, userId);
		await this.newsPostTranslationService.create({
			newsPostId: newsPost.id,
			languageCode,
			title,
			description,
			content,
			isDefault: true,
			userId,
		});

		return this.findOneNewsPostAssigneedId(newsPost.id, languageCode);
	}

	private async create(data: CreateNewsPostDto, userId: string) {
		const { title, newsCategoryId } = data;
		await this.newsPostQueryService.validate({ newsCategoryId });
		const slug = this.generateSlug(title);

		const entity = this.newsPostRepo.create({
			...data,
			slug,
			creatorId: userId,
			modifierId: userId,
		});
		return this.newsPostRepo.save(entity);
	}

	async getKeywords() {
		return this.newsPostQueryService.getKeywords();
	}

	async findOne(id: string): Promise<NewsPost> {
		const entity = await this.newsPostRepo.findOne({ where: { id } });

		if (!entity) throw new ResponseError(this.responseError.NOT_FOUND);
		return entity;
	}

	async listNewsPostLanguage(query: GetListNewsPostTranslations) {
		return await this.newsPostTranslationService.listOfNewsPost(query);
	}

	async findOneNewsPostAssigneedId(id: string, locale?: string) {
		return await this.assigneNewsPostTranslationId(id, locale);
	}

	async findOneWithRelations(id: string): Promise<NewsPost> {
		const entity = await this.newsPostQueryService.findOneWithRelations(id);

		if (!entity) throw new ResponseError(this.responseError.NOT_FOUND);
		return entity;
	}

	async detailTranslationDefault(id: string) {
		const entity = await this.findOneWithRelations(id);

		const translationDefault = entity.newsPostTranslations?.find(
			(item) => item.isDefault === true,
		);

		return translationDefault;
	}

	async detailTranslation(translationId: string) {
		return await this.newsPostTranslationService.findOne(translationId);
	}

	async findOnePublic(slug: string, locale?: string): Promise<NewsPost> {
		const newsPost = await this.newsPostQueryService.findOnePublic(slug);
		if (!newsPost) throw new ResponseError(this.responseError.NOT_FOUND);
		return this.assigneTranslationOne({ newsPost, languageCode: locale });
	}

	async getList(
		query: QueryGetListNewsPostDto,
		locale?: string,
	): Promise<PageDto<NewsPost>> {
		const { page, pageSize } = query;
		const { items, totalItems } =
			await this.newsPostQueryService.getList(query);

		const listAssigneed = this.assigneTranslationList({
			listNewsPost: items,
			languageCode: locale,
		});

		return new PageDto({
			items: listAssigneed,
			metadata: { page: page, pageSize, totalItems },
		});
	}

	async getListPublic(
		query: QueryGetListNewsPostDto,
		locale?: string,
	): Promise<PageDto<NewsPost>> {
		const { page, pageSize } = query;
		const { items, totalItems } =
			await this.newsPostQueryService.getListPublic(query);

		const listAssigneed = this.assigneTranslationList({
			listNewsPost: items,
			languageCode: locale,
		});

		return new PageDto({
			items: listAssigneed,
			metadata: { page: page, pageSize, totalItems },
		});
	}

	async handleUpdate(id: string, data: UpdateNewsPostDto, userId: string) {
		const { languageCode, title, description, content } = data;

		const entity = await this.findOne(id);

		if (
			data.newsCategoryId &&
			data.newsCategoryId !== entity.newsCategoryId
		) {
			await this.newsPostQueryService.validate({
				newsCategoryId: data.newsCategoryId,
			});
		}

		if (languageCode) {
			await this.newsPostTranslationService.updateTranslationOfNewsPost({
				newsPostId: id,
				languageCode,
				dataUpdate: {
					languageCode,
					title,
					description,
					content,
					userId,
				},
			});
		}

		const entityUpdate = this.newsPostRepo.create(data);
		await this.newsPostRepo.update(id, {
			...entityUpdate,
			modifierId: userId,
		});
		return await this.findOne(id);
	}

	async addTranslationNewsPost(
		id: string,
		translationNewsPost: AddTranslationNewsPostDto,
	) {
		const { content, languageCode, title, description, userId } =
			translationNewsPost;

		await this.newsPostTranslationService.create({
			newsPostId: id,
			content,
			languageCode,
			title,
			description,
			userId,
			isDefault: false,
		});
	}

	async delete(id: string): Promise<void> {
		const entity = await this.findOne(id);
		await this.newsPostRepo.delete(entity.id);
	}

	async deleteTranslation(translationId: string) {
		await this.newsPostTranslationService.delete(translationId);
	}

	private generateSlug(text: string): string {
		const slug = slugify(text, {
			lower: true,
			strict: true,
		});
		const timestamp = getTimeStamp();

		const result = `${slug}-${timestamp}`;

		return result;
	}

	private async assigneNewsPostTranslationId(
		id: string,
		languageCode?: string,
	) {
		const newsPost = await this.findOneWithRelations(id);
		return this.assigneTranslationOne({ newsPost, languageCode });
	}

	private assigneTranslationList({
		listNewsPost,
		languageCode,
	}: {
		listNewsPost: NewsPost[];
		languageCode?: string;
	}) {
		return listNewsPost.map((newsPost) =>
			this.assigneTranslationOne({ newsPost, languageCode }),
		);
	}

	private assigneTranslationOne({
		newsPost,
		languageCode,
	}: {
		newsPost: NewsPost;
		languageCode?: string;
	}) {
		const { newsPostTranslations } = newsPost;

		const newsPostTranslation =
			newsPostTranslations?.find(
				(i) => i.languageCode === languageCode,
			) ?? newsPostTranslations?.find((i) => i.isDefault);

		newsPost.title = newsPostTranslation?.title ?? null;
		newsPost.description = newsPostTranslation?.description ?? null;
		newsPost.content = newsPostTranslation?.content ?? null;
		newsPost.languageCode = newsPostTranslation?.languageCode ?? null;
		newsPost.languageName = newsPostTranslation?.language?.name ?? null;
		newsPost.newsPostTranslations = [];

		return newsPost;
	}
}
