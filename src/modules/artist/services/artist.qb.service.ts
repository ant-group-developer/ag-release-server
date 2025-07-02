import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryGetListArtistDto } from '../dto/artist.dto';
import { Artist } from '../entities/artist.entity';

@Injectable()
export class ArtistQbService {
	constructor(
		@InjectRepository(Artist)
		private readonly artistRepo: Repository<Artist>,
	) {}

	createQueryGetList(query: QueryGetListArtistDto) {
		const {
			keyword,
			id,

			startCreatedAt,
			endCreatedAt,
			startUpdatedAt,
			endUpdatedAt,

			fieldOrder,
			orderBy,

			skip,
			pageSize,
		} = query;

		const queryBuilder = this.artistRepo.createQueryBuilder('artist');

		if (keyword) {
			queryBuilder.andWhere('artist.name LIKE :keyword', {
				keyword: `%${keyword}%`,
			});
		}

		if (id) {
			queryBuilder.andWhere('artist.id LIKE :id', {
				id: `%${id}%`,
			});
		}

		if (startCreatedAt && endCreatedAt) {
			queryBuilder.andWhere(
				`artist.createdAt BETWEEN :startCreatedAt AND :endCreatedAt`,
				{
					startCreatedAt,
					endCreatedAt,
				},
			);
		}

		if (startUpdatedAt && endUpdatedAt) {
			queryBuilder.andWhere(
				`artist.updatedAt BETWEEN :startUpdatedAt AND :endUpdatedAt`,
				{
					startUpdatedAt,
					endUpdatedAt,
				},
			);
		}

		queryBuilder.orderBy(`artist.${fieldOrder}`, orderBy);
		queryBuilder.skip(skip).take(pageSize);

		return queryBuilder;
	}
}
