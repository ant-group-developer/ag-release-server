import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/common.response.dto';
import { Repository } from 'typeorm';
import { NewsCategoryResponse } from '../constants/news-category.constant';
import { QueryGetListNewsCategoryDto } from '../dto/news-category.dto';
import { NewsCategory } from '../entities/news-category.entity';

@Injectable()
export class NewsCategoryQueryService {
	constructor(
		@InjectRepository(NewsCategory)
		private readonly newsCategoryRepo: Repository<NewsCategory>,
	) {}

	async getList(query: QueryGetListNewsCategoryDto) {
		const qb = this.createQueryGetList(query);
		const [items, totalItems] = await qb.getManyAndCount();
		return { items, totalItems };
	}

	async getListSimple() {
		return this.newsCategoryRepo.find({
			select: ['id', 'nameVi', 'nameEn'],
			order: { order: 'ASC' },
		});
	}

	async validate({ nameVi, nameEn }: { nameVi?: string; nameEn?: string }) {
		if (nameVi) {
			const exist = await this.newsCategoryRepo.findOne({
				where: { nameVi },
			});
			if (exist)
				throw new ResponseError(NewsCategoryResponse.DUPLICATE_NAME_VI);
		}
		if (nameEn) {
			const exist = await this.newsCategoryRepo.findOne({
				where: { nameEn },
			});
			if (exist)
				throw new ResponseError(NewsCategoryResponse.DUPLICATE_NAME_EN);
		}
	}

	// private
	private createQueryGetList(filter: QueryGetListNewsCategoryDto) {
		const { keyword, skip, pageSize, fieldOrder, orderBy } = filter;
		const qb = this.newsCategoryRepo.createQueryBuilder('newsCategory');

		if (keyword) {
			qb.andWhere(
				'(newsCategory.nameVi ILIKE :keyword OR newsCategory.nameEn ILIKE :keyword)',
				{ keyword: `%${keyword}%` },
			);
		}

		qb.orderBy(fieldOrder, orderBy);
		qb.skip(skip).take(pageSize);

		return qb;
	}
}
