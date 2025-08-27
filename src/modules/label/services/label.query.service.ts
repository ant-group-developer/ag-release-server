import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import { LabelMessage } from '../constants/label.constant';
import { QueryGetListLabelDto } from '../dto/label.dto';
import { Label } from '../entities/label.entity';
import {
	VirtualColumnsLabel,
	VirtualColumnsLabelArr,
} from '../enum/label.enum';
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
		queryBuilder
			.addSelect((subQuery) => {
				return subQuery
					.select('COUNT(DISTINCT(track.id))')
					.from('tracks', 'track')
					.leftJoin('track.release', 'release')
					.where('release.labelId = label.id');
			}, VirtualColumnsLabel.TRACK_COUNT)

			.addSelect((subQuery) => {
				return subQuery
					.select('COUNT(DISTINCT(release.id))')
					.from('releases', 'release')
					.where('release.labelId = label.id');
			}, VirtualColumnsLabel.RELEASE_COUNT);

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

		if (VirtualColumnsLabelArr.includes(fieldOrder)) {
			queryBuilder.orderBy(`${fieldOrder}`, orderBy);
		} else {
			queryBuilder.orderBy(`label.${fieldOrder}`, orderBy);
		}

		queryBuilder.skip(skip).take(pageSize);

		return queryBuilder;
	}

	async getList(query: QueryGetListLabelDto) {
		const queryGetList = this.createQueryGetList(query);
		const dataFromDb: IDataFromDb = await queryGetList.getRawAndEntities();
		const totalItems = await queryGetList.getCount();

		const labels = this.assigneeVirtualColumn(dataFromDb);

		return { labels, totalItems };
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
	async validate({ name }: { name?: string }) {
		if (name) {
			const artist = await this.labelRepo.findOne({ where: { name } });

			if (artist) {
				throw new ResponseError(LabelMessage.DUPLICATE_NAME_LABEL);
			}
		}
	}

	validateDelete(label: Label) {
		if ((label.releaseCount ?? 0) > 0) {
			throw new ResponseError(
				LabelMessage.CANNOT_DELETE_BECAUSE_LINKED_RELEASES,
			);
		}
	}
}
