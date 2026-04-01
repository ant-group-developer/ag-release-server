import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/common.response.dto';
import { Repository } from 'typeorm';
import { GenreMessage } from '../constants/genre.constant';
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

	// validate
	async validate({ name, code }: { name?: string; code?: string }) {
		if (name) {
			const genre = await this.genreRepo.findOne({ where: { name } });
			if (genre) {
				throw new ResponseError(GenreMessage.DUPLICATE_NAME_GENRE);
			}
		}

		if (code) {
			const genre = await this.genreRepo.findOne({ where: { code } });
			if (genre) {
				throw new ResponseError(GenreMessage.DUPLICATE_CODE_GENRE);
			}
		}
	}

	validateDelete(genre: Genre) {
		if ((genre.primaryGenreReleasesCount ?? 0) > 0) {
			throw new ResponseError(
				GenreMessage.CANNOT_DELETE_BECAUSE_LINKED_PRIMARY_RELEASES,
			);
		}

		if ((genre.subGenreReleasesCount ?? 0) > 0) {
			throw new ResponseError(
				GenreMessage.CANNOT_DELETE_BECAUSE_LINKED_SUB_RELEASES,
			);
		}

		if ((genre.primaryGenreTracksCount ?? 0) > 0) {
			throw new ResponseError(
				GenreMessage.CANNOT_DELETE_BECAUSE_LINKED_PRIMARY_TRACKS,
			);
		}

		if ((genre.subGenreTracksCount ?? 0) > 0) {
			throw new ResponseError(
				GenreMessage.CANNOT_DELETE_BECAUSE_LINKED_SUB_TRACKS,
			);
		}
	}

	async getListSimple() {
		return this.genreRepo
			.createQueryBuilder('g')
			.select(['g.id', 'g.name', 'g.code'])
			.orderBy('g.name', 'ASC')	
			.getMany();
	}
}
