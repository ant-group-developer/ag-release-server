import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryGetListLabelDto } from '../dto/label.dto';
import { Label } from '../entities/label.entity';

@Injectable()
export class LabelQbService {
	constructor(
		@InjectRepository(Label)
		private readonly labelRepo: Repository<Label>,
	) {}

	createQueryGetList(query: QueryGetListLabelDto) {
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

		const queryBuilder = this.labelRepo.createQueryBuilder('label');

		if (keyword) {
			queryBuilder.andWhere('label.name LIKE :keyword', {
				keyword: `%${keyword}%`,
			});
		}

		if (startCreatedAt && endCreatedAt) {
			queryBuilder.andWhere(
				`label.createdAt BETWEEN :startCreatedAt AND :endCreatedAt`,
				{
					startCreatedAt,
					endCreatedAt,
				},
			);
		}

		if (startUpdatedAt && endUpdatedAt) {
			queryBuilder.andWhere(
				`label.updatedAt BETWEEN :startUpdatedAt AND :endUpdatedAt`,
				{
					startUpdatedAt,
					endUpdatedAt,
				},
			);
		}

		queryBuilder.orderBy(`label.${fieldOrder}`, orderBy);
		queryBuilder.skip(skip).take(pageSize);

		return queryBuilder;
	}
}
