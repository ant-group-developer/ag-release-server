import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { splitCodeIndex, stringToCode } from 'src/utils/util';
import { Repository } from 'typeorm';
import { ArtistMessage } from '../constants/artist.constant';
import { QueryGetListArtistDto } from '../dto/artist.dto';
import { Artist } from '../entities/artist.entity';
import {
	VirtualColumnsArtist,
	VirtualColumnsArtistArr,
} from '../enum/artist.enum';

@Injectable()
export class ArtistQueryService {
	constructor(
		@InjectRepository(Artist)
		private readonly artistRepo: Repository<Artist>,
	) {}

	private createQueryGetList(query: QueryGetListArtistDto) {
		const {
			keyword,
			code,
			tenantIds,

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
			.leftJoin('artist.artistProfiles', 'artistProfile')
			.leftJoin('artistProfile.dsp', 'dsp')

			.addSelect([
				'artistProfile.id',
				'artistProfile.name',
				'artistProfile.url',
			])

			.addSelect([
				'dsp.id',
				'dsp.name',
				'dsp.code',
				'dsp.picture',
				'dsp.isActive',
				'dsp.formatLinks',
			])

			.addSelect((subQuery) => {
				subQuery
					.select('COUNT(DISTINCT(release_artist.id))')
					.from('release_artist', 'release_artist')
					.leftJoin(
						'releases',
						'release',
						'release.id = release_artist.release_id',
					)
					.where('release_artist.artist_id = artist.id');

				if (tenantIds?.length) {
					subQuery.andWhere('release.tenant_id IN (:...tenantIds)', {
						tenantIds,
					});
				}

				return subQuery;
			}, VirtualColumnsArtist.TRACK_COUNT)

			.addSelect((subQuery) => {
				subQuery
					.select('COUNT(track_artist.id)')
					.from('track_artist', 'track_artist')
					.leftJoin(
						'tracks',
						'track',
						'track_artist.track_id = track.id',
					)
					.leftJoin(
						'releases',
						'release',
						'track.release_id = release.id',
					)
					.where('track_artist.artist_id = artist.id');

				if (tenantIds?.length) {
					subQuery.andWhere('release.tenant_id IN (:...tenantIds)', {
						tenantIds,
					});
				}

				return subQuery;
			}, VirtualColumnsArtist.RELEASE_COUNT);

		if (keyword) {
			queryBuilder.andWhere('artist.name ILIKE :keyword', {
				keyword: `%${keyword}%`,
			});
		}

		if (code) {
			queryBuilder.andWhere('artist.code ILIKE :code', {
				code: `%${code}%`,
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

		if (VirtualColumnsArtistArr.includes(fieldOrder)) {
			queryBuilder.orderBy(`${fieldOrder}`, orderBy);
		} else {
			queryBuilder.orderBy(`artist.${fieldOrder}`, orderBy);
		}

		queryBuilder.addOrderBy('dsp.name', 'ASC');
		queryBuilder.skip(skip).take(pageSize);

		return queryBuilder;
	}

	async getList(query: QueryGetListArtistDto) {
		const queryGetList = this.createQueryGetList(query);
		const [dataFromDb, totalItems]: [IDataFromDb, number] =
			await Promise.all([
				queryGetList.getRawAndEntities(),
				queryGetList.getCount(),
			]);

		const artists = this.assigneeVirtualColumn(dataFromDb);

		return { artists, totalItems };
	}

	private assigneeVirtualColumn(dataFromDb: IDataFromDb) {
		return dataFromDb.entities.map((entity) => {
			const dataRawOfLabel = dataFromDb.raw.find(
				(item) => item.artist_id === entity.id,
			);

			entity.trackCount = Number(dataRawOfLabel?.track_count);
			entity.releaseCount = Number(dataRawOfLabel?.release_count);

			return entity;
		});
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
				'dsp.isActive',
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
			throw new ResponseError(ArtistMessage.DUPLICATE_NAME_ARTIST);
		}
	}

	validateDelete(artist: Artist) {
		if ((artist.releaseCount ?? 0) > 0) {
			throw new ResponseError(
				ArtistMessage.CANNOT_DELETE_BECAUSE_LINKED_RELEASES,
			);
		}

		if ((artist.trackCount ?? 0) > 0) {
			throw new ResponseError(
				ArtistMessage.CANNOT_DELETE_BECAUSE_LINKED_TRACKS,
			);
		}
	}

	async getCodeFromName(name: string) {
		const code = stringToCode(name) + '_0';
		return this.generateUniqueCode(code);
	}

	private async generateUniqueCode(code: string): Promise<string> {
		const entities = await this.artistRepo.findOne({
			where: { code },
		});

		if (!entities) return code;

		const { preCode, index } = splitCodeIndex(code);

		return this.generateUniqueCode(`${preCode}_${index + 1}`);
	}
}

interface IDataFromDb {
	entities: Artist[];
	raw: {
		artist_id: string;
		track_count: string;
		release_count: string;
	}[];
}
