import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PageDto, ResponseError } from 'src/common/dtos/common.response.dto';
import { Repository } from 'typeorm';
import { NewsCategoryResponse } from '../constants/news-category.constant';
import {
	BulkUpdateNewsCategory,
	CreateNewsCategoryDto,
	QueryGetListNewsCategoryDto,
	UpdateNewsCategoryDto,
} from '../dto/news-category.dto';
import { NewsCategory } from '../entities/news-category.entity';
import { NewsCategoryTree } from '../enum/news-category.enum';
import { NewsCategoryQueryService } from './news-category.query.service';

@Injectable()
export class NewsCategoryService {
	constructor(
		@InjectRepository(NewsCategory)
		private readonly newsCategoryRepo: Repository<NewsCategory>,
		private readonly newsCategoryQueryService: NewsCategoryQueryService,
	) {}

	async create(data: CreateNewsCategoryDto, userId: string) {
		const { nameVi, nameEn, parentId } = data;
		await this.newsCategoryQueryService.validate({ nameVi, nameEn });

		if (parentId) {
			await this.findOne(parentId);
		}

		const entity = this.newsCategoryRepo.create({
			...data,
			creatorId: userId,
			modifierId: userId,
		});
		return this.newsCategoryRepo.save(entity);
	}

	async findOne(id: string): Promise<NewsCategory> {
		const entity = await this.newsCategoryRepo.findOne({ where: { id } });
		if (!entity) throw new ResponseError(NewsCategoryResponse.NOT_FOUND);
		return entity;
	}

	async getList(
		query: QueryGetListNewsCategoryDto,
	): Promise<PageDto<NewsCategory>> {
		const { page, pageSize } = query;
		const { items, totalItems } =
			await this.newsCategoryQueryService.getList(query);
		return new PageDto({
			items,
			metadata: { page, pageSize, totalItems },
		});
	}

	async getListSimple() {
		return this.newsCategoryQueryService.getListSimple();
	}

	async update(id: string, data: UpdateNewsCategoryDto, userId: string) {
		const entity = await this.findOne(id);

		if (data.nameVi && data.nameVi !== entity.nameVi)
			await this.newsCategoryQueryService.validate({
				nameVi: data.nameVi,
			});
		if (data.nameEn && data.nameEn !== entity.nameEn)
			await this.newsCategoryQueryService.validate({
				nameEn: data.nameEn,
			});
		if (data?.parentId !== undefined) {
			if (data?.parentId) {
				await this.findOne(data.parentId);
				await this.validateParent(id, data.parentId);
			}
		}

		await this.newsCategoryRepo.update(id, { ...data, modifierId: userId });
		return this.findOne(id);
	}

	async bulkUpdate(data: BulkUpdateNewsCategory): Promise<NewsCategory[]> {
		const { newsCategories } = data;
		await Promise.all(
			newsCategories
				.filter((item) => item.id)
				.map((item) => this.findOne(item.id as string)),
		);
		return await this.newsCategoryRepo.save(newsCategories);
	}

	async delete(id: string): Promise<void> {
		const entity = await this.findOne(id);
		await this.newsCategoryRepo.delete(entity.id);
	}

	buildCategoryTree(
		categories: NewsCategory[],
		parentId: string | null = null,
	): NewsCategoryTree[] {
		return categories
			?.filter((cat) => cat.parentId === parentId)
			.map((cat) => ({
				...cat,
				children: this.buildCategoryTree(categories, cat.id),
			}))
			.sort((a, b) => a.order - b.order);
	}

	async getTree(): Promise<NewsCategoryTree[]> {
		const categories = await this.newsCategoryRepo.find();
		return this.buildCategoryTree(categories, null);
	}

	private getAllChildrenIds(
		parentId: string,
		allCategories: NewsCategory[],
	): string[] {
		const children = allCategories.filter(
			(cat) => cat.parentId === parentId,
		);

		let ids = children?.map((cat) => cat.id);
		for (const child of children) {
			ids = ids.concat(this.getAllChildrenIds(child.id, allCategories));
		}
		return ids;
	}

	private async validateParent(id: string, parentId: string) {
		if (id === parentId)
			throw new ResponseError({
				message: 'Không thể chọn chính danh mục này làm danh mục cha',
				statusCode: 400,
			});
		const allCategories = await this.newsCategoryRepo.find();
		const childrenIds = this.getAllChildrenIds(id, allCategories);
		if (childrenIds.includes(parentId)) {
			throw new ResponseError({
				message: 'Không thể chọn danh mục cha đã chứa danh mục này',
				statusCode: 400,
			});
		}
	}
}
