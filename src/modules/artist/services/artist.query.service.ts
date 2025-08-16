import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import {
	ArtistMessageCodeError,
	ArtistMessageError,
} from '../constants/artist.constant';
import { QueryGetListArtistDto } from '../dto/artist.dto';
import { Artist } from '../entities/artist.entity';

@Injectable()
export class ArtistQueryService {
	constructor(
		@InjectRepository(Artist)
		private readonly artistRepo: Repository<Artist>,
	) {}

	private createQueryGetList(query: QueryGetListArtistDto) {
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

		queryBuilder
			.leftJoinAndSelect('artist.artistProfiles', 'artistProfile')
			.leftJoinAndSelect('artistProfile.dsp', 'dsp');

		if (keyword) {
			queryBuilder.andWhere('artist.name ILIKE :keyword', {
				keyword: `%${keyword}%`,
			});
		}

		if (id) {
			queryBuilder.andWhere('artist.id ILIKE :id', {
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

	async getList(query: QueryGetListArtistDto) {
		const queryGetList = this.createQueryGetList(query);
		return await queryGetList.getManyAndCount();
	}

	async findOneWithCountRelation(id: string) {
		const queryBuilder = this.artistRepo
			.createQueryBuilder('artist')
			.where('artist.id = :id', { id })

			.loadRelationCountAndMap(
				'artist.releaseCount',
				'artist.releaseArtists',
			)
			.loadRelationCountAndMap(
				'artist.trackCount',
				'artist.trackArtists',
			);

		return await queryBuilder.getOne();
	}

	async findOneLite(id: string) {
		const query = this.artistRepo.createQueryBuilder('artist');
		query.where('artist.id = :id', {
			id,
		});

		query
			.leftJoin('artist.artistProfiles', 'artistProfile')
			.leftJoin('artistProfile.dsp', 'dsp');

		query
			.select([
				'artist.id',
				'artist.name',
				'artist.picture',
				'artist.biography',
			])
			.addSelect([
				'artistProfile.id',
				'artistProfile.name',
				'artistProfile.url',
				'artistProfile.dspId',
			])
			.addSelect([
				'dsp.id',
				'dsp.name',
				'dsp.picture',
				'dsp.canLinkArtistProfile',
				'dsp.formatLinks',
			]);

		query
			.loadRelationCountAndMap(
				'artist.releaseCount',
				'artist.releaseArtists',
			)
			.loadRelationCountAndMap(
				'artist.trackCount',
				'artist.trackArtists',
			);

		return await query.getOne();
	}

	// validate
	async validate({ name }: { name: string }) {
		const artist = await this.artistRepo.findOne({
			where: { name },
		});

		if (artist) {
			throw new ResponseError({
				message: ArtistMessageError.DUPLICATE_NAME_ARTIST,
				messageCode: ArtistMessageCodeError.DUPLICATE_NAME_ARTIST,
				statusCode: 409,
			});
		}
	}

	validateDelete(artist: Artist) {
		if ((artist.releaseCount ?? 0) > 0) {
			throw new ResponseError({
				message:
					ArtistMessageError.CANNOT_DELETE_BECAUSE_LINKED_RELEASES,
				messageCode:
					ArtistMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_RELEASES,
				statusCode: 400,
			});
		}

		if ((artist.trackCount ?? 0) > 0) {
			throw new ResponseError({
				message: ArtistMessageError.CANNOT_DELETE_BECAUSE_LINKED_TRACKS,
				messageCode:
					ArtistMessageCodeError.CANNOT_DELETE_BECAUSE_LINKED_TRACKS,
				statusCode: 400,
			});
		}
	}
}
