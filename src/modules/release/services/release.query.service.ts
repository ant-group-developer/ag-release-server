import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { Repository } from 'typeorm';
import { ReleaseMessageError } from '../constants/release.constant';
import { QueryGetListReleaseDto } from '../dto/release.dto';
import { Release } from '../entities/release.entity';

@Injectable()
export class ReleaseQueryService {
	private mainAlias: string;

	constructor(
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,
	) {
		this.mainAlias = 'release';
	}

	public getMainAlias() {
		return this.mainAlias;
	}

	private createQueryGetList(query: QueryGetListReleaseDto) {
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

		const queryBuilder = this.releaseRepo.createQueryBuilder(
			this.mainAlias,
		);

		if (keyword) {
			queryBuilder.andWhere('release.title ILIKE :keyword', {
				keyword: `%${keyword}%`,
			});
		}

		if (startCreatedAt && endCreatedAt) {
			queryBuilder.andWhere(
				`release.createdAt BETWEEN :startCreatedAt AND :endCreatedAt`,
				{
					startCreatedAt,
					endCreatedAt,
				},
			);
		}

		if (startUpdatedAt && endUpdatedAt) {
			queryBuilder.andWhere(
				`release.updatedAt BETWEEN :startUpdatedAt AND :endUpdatedAt`,
				{
					startUpdatedAt,
					endUpdatedAt,
				},
			);
		}

		queryBuilder.orderBy(`release.${fieldOrder}`, orderBy);
		queryBuilder.skip(skip).take(pageSize);

		return queryBuilder;
	}

	// public
	async findOne(id: string): Promise<Release> {
		const release = await this.releaseRepo.findOne({
			where: { id },
			relations: ['releaseLanguage', 'releaseTerritory'],
		});

		if (!release) {
			throw new ResponseError({
				message: ReleaseMessageError.NOT_FOUND,
				statusCode: 404,
			});
		}

		return release;
	}

	async getListDetail(query: QueryGetListReleaseDto) {
		const queryGetList = this.createQueryGetList(query);
		queryGetList
			.leftJoinAndSelect('release.releaseCoverArts', 'releaseCoverArts')

			.leftJoinAndSelect('release.releaseArtists', 'releaseArtists')
			.leftJoinAndSelect('releaseArtists.artist', 'artist')
			.leftJoinAndSelect('releaseArtists.artistRole', 'artistRole')

			.leftJoinAndSelect('release.label', 'label')
			.loadRelationCountAndMap('release.tracksCount', 'release.tracks');

		return await queryGetList.getManyAndCount();
	}

	async getOneDetail(id: string): Promise<Release> {
		const query = this.releaseRepo.createQueryBuilder(this.mainAlias);

		query
			.leftJoinAndSelect('release.label', 'label')

			.leftJoinAndSelect('release.primaryGenre', 'primaryGenre')
			.leftJoinAndSelect('release.subGenre', 'subGenre')

			.leftJoinAndSelect('release.releaseCoverArts', 'releaseCoverArts')

			.leftJoinAndSelect('release.releaseArtists', 'releaseArtists')
			.leftJoinAndSelect('releaseArtists.artist', 'artist')
			.leftJoinAndSelect('releaseArtists.artistRole', 'artistRole')

			.leftJoinAndSelect('release.releaseLanguage', 'releaseLanguage')
			.leftJoinAndSelect(
				'releaseLanguage.metadataLanguage',
				'metadataLanguage',
			)
			.leftJoinAndSelect('releaseLanguage.audioLanguage', 'audioLanguage')
			.leftJoinAndSelect(
				'releaseLanguage.metadataLanguageCountry',
				'metadataLanguageCountry',
			)

			.leftJoinAndSelect('release.timeZone', 'timeZone')

			.leftJoinAndSelect('release.releaseTerritory', 'releaseTerritory');

		query.where('release.id = :id', {
			id,
		});

		const release = await query.getOne();

		if (!release) {
			throw new ResponseError({
				message: ReleaseMessageError.NOT_FOUND,
				statusCode: 404,
			});
		}

		return release;
	}
}
