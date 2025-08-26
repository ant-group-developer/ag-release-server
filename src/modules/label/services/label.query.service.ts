import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { FindOneOptions, Repository } from 'typeorm';
import {
	LabelMessageCodeError,
	LabelMessageError,
} from '../constants/label.constant';
import { QueryGetListLabelDto } from '../dto/label.dto';
import { Label } from '../entities/label.entity';
import { IDataFromDb } from '../interfaces/label.interface';

@Injectable()
export class LabelQueryService {
	constructor(
		@InjectRepository(Label)
		private readonly labelRepo: Repository<Label>,
	) {}

	private createQueryGetList(query: QueryGetListLabelDto) {
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
			queryBuilder.andWhere('label.name ILIKE :keyword', {
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

	async getList(query: QueryGetListLabelDto) {
		const queryGetList = this.createQueryGetList(query);
		return await queryGetList.getManyAndCount();
	}

	private createQueryFindOneWithCountRelation(id: string) {
		const queryBuilder = this.labelRepo
			.createQueryBuilder('label')
			.where('label.id = :id', { id })

			.addSelect((subQuery) => {
				return subQuery
					.select('COUNT(DISTINCT(track.id))')
					.from('tracks', 'track')
					.leftJoin('track.release', 'release')
					.where('release.labelId = label.id');
			}, 'track_count')

			.addSelect((subQuery) => {
				return subQuery
					.select('COUNT(DISTINCT(release.id))')
					.from('releases', 'release')
					.where('release.labelId = label.id');
			}, 'release_count');

		return queryBuilder;
	}

	private assigneeVirtualColumn(dataFromDb: IDataFromDb) {
		return dataFromDb.entities.map((entity) => {
			const dataRawOfLabel = dataFromDb.raw.find(
				(item) => item.label_id === entity.id,
			);

			entity.trackCount = Number(dataRawOfLabel?.track_count);
			entity.releaseCount = Number(dataRawOfLabel?.release_count);

			return entity;
		});
	}

	async findOneWithCountRelation(id: string) {
		const queryBuilder = this.createQueryFindOneWithCountRelation(id);

		// length = 1
		const dataFromDb: IDataFromDb = await queryBuilder.getRawAndEntities();
		const label = this.assigneeVirtualColumn(dataFromDb);
		return label[0];
	}

	// validate
	async validate(options: FindOneOptions<Label>) {
		// if (name) {
		const label = await this.labelRepo.findOne(options);

		if (label) {
			throw new ResponseError({
				message: LabelMessageError.DUPLICATE_NAME_LABEL,
				messageCode: LabelMessageCodeError.DUPLICATE_NAME_LABEL,
				statusCode: 409,
			});
		}
		// }
	}

	validateDelete(label: Label) {
		if ((label.releaseCount ?? 0) > 0) {
			throw new ResponseError({
				message:
					LabelMessageError.CANNOT_DELETE_BECAUSE_LINKED_RELEASES,
				messageCode:
					LabelMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_RELEASES,
				statusCode: 400,
			});
		}
	}
}
