import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryGetListAlbumFormatDto } from '../dto/album-format.dto';
import { AlbumFormat } from '../entities/album-format.entity';

@Injectable()
export class AlbumFormatQueryService {
	constructor(
		@InjectRepository(AlbumFormat)
		private readonly albumFormatRepo: Repository<AlbumFormat>,
	) {}

	private createQueryGetList(query: QueryGetListAlbumFormatDto) {
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

		const queryBuilder =
			this.albumFormatRepo.createQueryBuilder('albumFormat');

		if (keyword) {
			queryBuilder.andWhere('albumFormat.name ILIKE :keyword', {
				keyword: `%${keyword}%`,
			});
		}

		if (startCreatedAt && endCreatedAt) {
			queryBuilder.andWhere(
				`albumFormat.createdAt BETWEEN :startCreatedAt AND :endCreatedAt`,
				{
					startCreatedAt,
					endCreatedAt,
				},
			);
		}

		if (startUpdatedAt && endUpdatedAt) {
			queryBuilder.andWhere(
				`albumFormat.updatedAt BETWEEN :startUpdatedAt AND :endUpdatedAt`,
				{
					startUpdatedAt,
					endUpdatedAt,
				},
			);
		}

		queryBuilder.orderBy(`albumFormat.${fieldOrder}`, orderBy);
		queryBuilder.skip(skip).take(pageSize);

		return queryBuilder;
	}

	async getList(query: QueryGetListAlbumFormatDto) {
		const queryGetList = this.createQueryGetList(query);
		return await queryGetList.getManyAndCount();
	}

	async findOneWithCountRelation(id: string) {
		const queryBuilder = this.albumFormatRepo
			.createQueryBuilder('albumFormat')
			.where('albumFormat.id = :id', { id })

			.loadRelationCountAndMap(
				'albumFormat.releasesCount',
				'albumFormat.releases',
			);

		return await queryBuilder.getOne();
	}
}
