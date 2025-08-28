import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { checkIsSystemTenant } from 'src/modules/user/utils/user-type.util';
import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';
import { ReleaseMessages } from '../constants/release.constant';
import { QueryGetListReleaseDto } from '../dto/release.dto';
import { Release } from '../entities/release.entity';
import {
	VirtualColumnRelease,
	VirtualColumnReleaseArr,
} from '../enum/release.enum';

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

			startDateRelease,
			endDateRelease,

			albumFormatId,
			status,
			primaryGenreId,
			subGenreId,
			labelId,
			artistId,
			isVariousArtist,

			fieldOrder,
			orderBy,

			skip,
			pageSize,
		} = query;

		const queryBuilder = this.releaseRepo.createQueryBuilder(
			this.mainAlias,
		);

		if (keyword) {
			queryBuilder.andWhere(
				new Brackets((qb) => {
					qb.where('release.title ILIKE :keyword')
						.orWhere('albumFormat.name ILIKE :keyword')
						.orWhere('artist.name ILIKE :keyword')
						.orWhere('label.name ILIKE :keyword');
				}),
				{ keyword: `%${keyword}%` },
			);
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

		if (startDateRelease && endDateRelease) {
			queryBuilder.andWhere(
				`release.releaseDate BETWEEN :startDateRelease AND :endDateRelease`,
				{
					startDateRelease,
					endDateRelease,
				},
			);
		}

		if (albumFormatId?.length) {
			queryBuilder.andWhere(
				'release.albumFormatId IN (:...albumFormatId)',
				{
					albumFormatId,
				},
			);
		}

		if (primaryGenreId?.length) {
			queryBuilder.andWhere(
				'release.primaryGenreId IN (:...primaryGenreId)',
				{
					primaryGenreId,
				},
			);
		}

		if (subGenreId?.length) {
			queryBuilder.andWhere('release.subGenreId IN (:...subGenreId)', {
				subGenreId,
			});
		}

		if (labelId?.length) {
			queryBuilder.andWhere('release.labelId IN (:...labelId)', {
				labelId,
			});
		}

		if (artistId?.length) {
			queryBuilder.andWhere('releaseArtist.artistId IN (:...artistId)', {
				artistId,
			});
		}

		if (status?.length) {
			queryBuilder.andWhere('release.status IN (:...status)', {
				status,
			});
		}

		if (isVariousArtist !== undefined) {
			queryBuilder.andWhere(
				'release.isVariousArtist = :isVariousArtist',
				{
					isVariousArtist,
				},
			);
		}

		if (VirtualColumnReleaseArr.includes(fieldOrder)) {
			queryBuilder.orderBy(`${fieldOrder}`, orderBy);
		} else {
			queryBuilder.orderBy(`release.${fieldOrder}`, orderBy);
		}

		queryBuilder.skip(skip).take(pageSize);

		return queryBuilder;
	}

	filterByPermission(
		queryBuilder: SelectQueryBuilder<Release>,
		tenantId: string,
	) {
		if (checkIsSystemTenant(tenantId)) {
			queryBuilder
				.leftJoin('release.tenant', 'tenant')
				.addSelect(['tenant.id', 'tenant.name']);
		} else {
			queryBuilder.andWhere('release.tenantId = :tenantId', { tenantId });
		}
	}

	// public
	async findOne(id: string): Promise<Release> {
		const release = await this.releaseRepo.findOne({
			where: { id },
			relations: ['releaseLanguage', 'releaseTerritory'],
		});

		if (!release) {
			throw new ResponseError(ReleaseMessages.NOT_FOUND);
		}

		return release;
	}

	async getManyAndCount(query: QueryGetListReleaseDto, tenantId: string) {
		const queryGetList = this.createQueryGetList(query);
		this.filterByPermission(queryGetList, tenantId);

		// left join
		queryGetList
			.leftJoin('release.albumFormat', 'albumFormat')
			.leftJoin('release.releaseCoverArts', 'releaseCoverArt')
			.leftJoin('release.releaseArtists', 'releaseArtist')
			.leftJoin('releaseArtist.artist', 'artist')
			.leftJoin('releaseArtist.artistRole', 'artistRole')
			.leftJoin('release.label', 'label')

			.addSelect([
				'albumFormat.id',
				'albumFormat.name',
				'albumFormat.code',
				'albumFormat.minTrackCount',
				'albumFormat.maxTrackCount',
			])
			.addSelect([
				'releaseCoverArt.id',
				'releaseCoverArt.fileId',
				'releaseCoverArt.releaseId',
				'releaseCoverArt.width',
				'releaseCoverArt.height',
				'releaseCoverArt.type',
			])
			.addSelect([
				'releaseArtist.id',
				'releaseArtist.artistRoleId',
				'releaseArtist.artistId',
				'releaseArtist.releaseId',
				'releaseArtist.addArtistToTracks',
			])
			.addSelect([
				'artist.id',
				'artist.name',
				'artist.code',
				'artist.picture',
				'artist.biography',
			])
			.addSelect(['artistRole.id', 'artistRole.name', 'artistRole.code'])
			.addSelect([
				'label.id',
				'label.name',
				'label.code',
				'label.picture',
				'label.description',
			])

			// virtual
			.addSelect((subQuery) => {
				return subQuery
					.select('COUNT(track.id)')
					.from('tracks', 'track')
					.where('track.releaseId = release.id');
			}, VirtualColumnRelease.TRACKS_COUNT)

			.addSelect((subQuery) => {
				return subQuery
					.select('SUM(audioFile.duration)')
					.from('tracks', 'track')
					.leftJoin('track.audioFile', 'audioFile')
					.where('track.releaseId = release.id');
			}, VirtualColumnRelease.TOTAL_DURATION);

		const [dataFromDb, totalItems]: [
			{
				entities: Release[];
				raw: {
					release_id: string;
					tracks_count: string;
					total_duration: string;
				}[];
			},
			number,
		] = await Promise.all([
			queryGetList.getRawAndEntities(),
			queryGetList.getCount(),
		]);

		const releases = this.assigneeVirtualColumn(dataFromDb);

		return {
			totalItems,
			releases,
		};
	}

	private assigneeVirtualColumn(dataFromDb: {
		entities: Release[];
		raw: {
			release_id: string;
			tracks_count: string;
			total_duration: string;
		}[];
	}) {
		return dataFromDb.entities.map((entity) => {
			const dataRawOfRelease = dataFromDb.raw.find(
				(item) => item.release_id === entity.id,
			);

			entity.tracksCount = Number(dataRawOfRelease?.tracks_count);
			entity.totalDuration = Number(dataRawOfRelease?.total_duration);

			return entity;
		});
	}

	async getOneDetail(id: string): Promise<Release> {
		const query = this.releaseRepo.createQueryBuilder(this.mainAlias);

		query
			.leftJoin('release.albumFormat', 'albumFormat')
			.leftJoin('release.label', 'label')

			.leftJoin('release.primaryGenre', 'primaryGenre')
			.leftJoin('release.subGenre', 'subGenre')

			.leftJoin('release.releaseCoverArts', 'releaseCoverArt')

			.leftJoin('release.releaseArtists', 'releaseArtist')
			.leftJoin('releaseArtist.artist', 'artist')
			.leftJoin('releaseArtist.artistRole', 'artistRole')

			.leftJoin('release.releaseLanguage', 'releaseLanguage')

			.leftJoin('releaseLanguage.metadataLanguage', 'metadataLanguage')
			.leftJoin('releaseLanguage.audioLanguage', 'audioLanguage')
			.leftJoin(
				'releaseLanguage.metadataLanguageCountry',
				'metadataLanguageCountry',
			)
			.leftJoin('release.timeZone', 'timeZone')
			.leftJoin('release.releaseTerritory', 'releaseTerritory')

			.leftJoin('release.modifier', 'modifier')

			.addSelect([
				'albumFormat.id',
				'albumFormat.name',
				'albumFormat.code',
				'albumFormat.minTrackCount',
				'albumFormat.maxTrackCount',
			])
			.addSelect([
				'label.id',
				'label.name',
				'label.code',
				'label.picture',
				'label.description',
			])
			.addSelect([
				'primaryGenre.id',
				'primaryGenre.name',
				'primaryGenre.code',
				'primaryGenre.picture',
				'primaryGenre.description',
			])
			.addSelect([
				'subGenre.id',
				'subGenre.name',
				'subGenre.code',
				'subGenre.picture',
				'subGenre.description',
			])
			.addSelect([
				'releaseCoverArt.id',
				'releaseCoverArt.fileId',
				'releaseCoverArt.releaseId',
				'releaseCoverArt.width',
				'releaseCoverArt.height',
				'releaseCoverArt.type',
			])
			.addSelect([
				'releaseArtist.id',
				'releaseArtist.artistRoleId',
				'releaseArtist.artistId',
				'releaseArtist.releaseId',
				'releaseArtist.addArtistToTracks',
			])
			.addSelect([
				'artist.id',
				'artist.name',
				'artist.code',
				'artist.picture',
				'artist.biography',
			])
			.addSelect(['artistRole.id', 'artistRole.name', 'artistRole.code'])
			.addSelect([
				'releaseLanguage.id',
				'releaseLanguage.metadataLanguageCountryId',
				'releaseLanguage.audioLanguageId',
				'releaseLanguage.metadataLanguageId',
				'releaseLanguage.releaseId',
			])
			.addSelect([
				'metadataLanguage.id',
				'metadataLanguage.name',
				'metadataLanguage.code',
			])
			.addSelect([
				'audioLanguage.id',
				'audioLanguage.name',
				'audioLanguage.code',
			])
			.addSelect([
				'metadataLanguageCountry.id',
				'metadataLanguageCountry.name',
			])
			.addSelect([
				'timeZone.id',
				'timeZone.name',
				'timeZone.utc',
				'timeZone.zone',
			])
			.addSelect([
				'releaseTerritory.id',
				'releaseTerritory.distributeWorldwide',
				'releaseTerritory.distributionType',
				'releaseTerritory.selectedCountries',
			])

			.addSelect(['modifier.id', 'modifier.name', 'modifier.avatar']);

		query.where('release.id = :id', {
			id,
		});

		const release = await query.getOne();

		if (!release) {
			throw new ResponseError(ReleaseMessages.NOT_FOUND);
		}

		return release;
	}
}
