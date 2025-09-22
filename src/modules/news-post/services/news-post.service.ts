import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/common.response.dto';
import { Repository } from 'typeorm';
import { NewsPostResponse } from '../constants/news-post.constant';
import {
	CreateNewsPostDto,
	QueryGetListNewsPostDto,
	UpdateNewsPostDto,
} from '../dto/news-post.dto';
import { NewsPost } from '../entities/news-post.entity';
import { NewsPostQueryService } from './news-post.query.service';

@Injectable()
export class NewsPostService {
	constructor(
		@InjectRepository(NewsPost)
		private readonly newsPostRepo: Repository<NewsPost>,
		private readonly newsPostQueryService: NewsPostQueryService,
	) {}

	async create(data: CreateNewsPostDto, userId: string) {
		const { slug, newsCategoryId } = data;
		await this.newsPostQueryService.validate({ slug, newsCategoryId });

		const entity = this.newsPostRepo.create({
			...data,
			creatorId: userId,
			modifierId: userId,
		});
		return this.newsPostRepo.save(entity);
	}

	async getKeywords() {
		return this.newsPostQueryService.getKeywords();
	}

	async findOne(id: string): Promise<NewsPost> {
		const entity = await this.newsPostRepo.findOne({
			where: { id },
			relations: ['newsCategory'],
		});
		if (!entity) throw new ResponseError(NewsPostResponse.NOT_FOUND);
		return entity;
	}

	async getList(query: QueryGetListNewsPostDto): Promise<PageDto<NewsPost>> {
		const { page, pageSize } = query;
		const { items, totalItems } =
			await this.newsPostQueryService.getList(query);

		return new PageDto({
			items,
			metadata: { currentPage: page, pageSize, totalItems },
		});
	}

	async getListPublic(
		query: QueryGetListNewsPostDto,
	): Promise<PageDto<NewsPost>> {
		const { page, pageSize } = query;
		const { items, totalItems } =
			await this.newsPostQueryService.getListPublic(query);
		return new PageDto({
			items,
			metadata: { currentPage: page, pageSize, totalItems },
		});
	}

	async update(id: string, data: UpdateNewsPostDto, userId: string) {
		const entity = await this.findOne(id);

		if (data.slug && data.slug !== entity.slug)
			await this.newsPostQueryService.validate({ slug: data.slug });

		if (
			data.newsCategoryId &&
			data.newsCategoryId !== entity.newsCategoryId
		)
			await this.newsPostQueryService.validate({
				newsCategoryId: data.newsCategoryId,
			});

		await this.newsPostRepo.update(id, { ...data, modifierId: userId });
		return this.findOne(id);
	}

	async delete(id: string): Promise<void> {
		const entity = await this.findOne(id);
		await this.newsPostRepo.delete(entity.id);
	}
}
