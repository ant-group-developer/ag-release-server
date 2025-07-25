import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryGetListGenreDto } from '../dto/genre.dto';
import { Genre } from '../entities/genre.entity';

@Injectable()
export class GenreQueryService {
	constructor(
		@InjectRepository(Genre)
		private readonly genreRepo: Repository<Genre>,
	) {}

	createQueryGetList(query: QueryGetListGenreDto) {
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

		const queryBuilder = this.genreRepo.createQueryBuilder('genre');

		if (keyword) {
			queryBuilder.andWhere('genre.name ILIKE :keyword', {
				keyword: `%${keyword}%`,
			});
		}

		if (startCreatedAt && endCreatedAt) {
			queryBuilder.andWhere(
				`genre.createdAt BETWEEN :startCreatedAt AND :endCreatedAt`,
				{
					startCreatedAt,
					endCreatedAt,
				},
			);
		}

		if (startUpdatedAt && endUpdatedAt) {
			queryBuilder.andWhere(
				`genre.updatedAt BETWEEN :startUpdatedAt AND :endUpdatedAt`,
				{
					startUpdatedAt,
					endUpdatedAt,
				},
			);
		}

		queryBuilder.orderBy(`genre.${fieldOrder}`, orderBy);
		queryBuilder.skip(skip).take(pageSize);

		return queryBuilder;
	}

	async findOneWithCountRelation(id: string) {
		const queryBuilder = this.genreRepo
			.createQueryBuilder('genre')
			.where('genre.id = :id', { id })

			.loadRelationCountAndMap(
				'genre.primaryGenreReleasesCount',
				'genre.primaryGenreReleases',
			)
			.loadRelationCountAndMap(
				'genre.subGenreReleasesCount',
				'genre.subGenreReleases',
			)

			.loadRelationCountAndMap(
				'genre.primaryGenreTracksCount',
				'genre.primaryGenreTracks',
			)
			.loadRelationCountAndMap(
				'genre.subGenreTracksCount',
				'genre.subGenreTracks',
			);

		return await queryBuilder.getOne();
	}
}
