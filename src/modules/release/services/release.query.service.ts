import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { OrmService } from 'src/modules/orm/orm.service';
import { Track } from 'src/modules/track/entities/track.entity';
import { toSnakeCaseKeys } from 'src/utils/util';
import {
	Brackets,
	ILike,
	In,
	Not,
	Repository,
	SelectQueryBuilder,
} from 'typeorm';
import { ReleaseException } from '../constants/release.constant';
import {
	QueryGetListReleaseDto,
	QueryGetListReleaseDto2,
} from '../dto/release.dto';
import { Release } from '../entities/release.entity';
import {
	ReleaseStatus,
	VirtualColumnRelease,
	VirtualColumnReleaseArr,
} from '../enum/release.enum';
interface IDataFromDb {
	entities: Release[];
	raw: {
		release_id: string;
		tracks_count: string;
		total_duration: string;
	}[];
}

@Injectable()
export class ReleaseQueryService {
	private mainAlias: string;

	constructor(
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,

		@InjectRepository(Track)
		private readonly trackRepo: Repository<Track>,

		private readonly ormService: OrmService,
	) {
		this.mainAlias = 'release';
	}

	public getMainAlias() {
		return this.mainAlias;
	}

	// public
	async findOne(id: string): Promise<Release> {
		const release = await this.releaseRepo.findOne({
			where: { id },
			relations: ['releaseLanguage', 'releaseTerritory', 'albumFormat'],
		});

		if (!release) {
			throw ReleaseException.NOT_FOUND();
		}

		return release;
	}

	async validateDelete(id: string): Promise<Release> {
		const release = await this.findOne(id);

		if (release.status !== ReleaseStatus.DRAFT) {
			throw ReleaseException.CANNOT_DELETE_NON_DRAFT();
		}

		return release;
	}

	async getManyAndCount(query: QueryGetListReleaseDto) {
		const qb = this.releaseRepo.createQueryBuilder(this.mainAlias);

		this.filterByQuery(qb, query);
		this.leftJoin(qb);
		this.select(qb, query);

		const [dataFromDb, totalItems]: [IDataFromDb, number] =
			await Promise.all([qb.getRawAndEntities(), qb.getCount()]);

		const releases = this.assigneeVirtualColumn(dataFromDb);

		return {
			totalItems,
			releases,
		};
	}

	async getManyAndCount2(query: QueryGetListReleaseDto2) {
		const qb = this.ormService.createReleaseQb();

		this.filterByQuery(qb, query);
		this.leftJoin(qb);
		this.select(qb, query);

		const [dataFromDb, totalItems]: [IDataFromDb, number] =
			await Promise.all([qb.getRawAndEntities(), qb.getCount()]);

		const releases = this.assigneeVirtualColumn(dataFromDb);

		return {
			totalItems,
			releases,
		};
	}

	async getListSimple(query: QueryGetListReleaseDto): Promise<any> {
		const { idInclude, page, pageSize, keyword, type } = query;

		const releaseInclude = idInclude?.length
			? await this.releaseRepo.find({
					select: {
						id: true,
						title: true,
					},
					where: { id: In(idInclude) },
				})
			: [];

		const [items, totalItems] = await this.releaseRepo.findAndCount({
			select: {
				id: true,
				title: true,
			},
			where: {
				...(keyword ? { title: ILike(`%${keyword}%`) } : {}),
				...(type ? { type } : {}),
				...(idInclude?.length ? { id: Not(In(idInclude)) } : {}),
			},
			order: { title: 'ASC' },
			skip: (page - 1) * pageSize,
			take: pageSize,
		});

		return { items: [...releaseInclude, ...items], totalItems };
	}

	private newReleaseQb() {
		return this.releaseRepo.createQueryBuilder('release');
	}

	private selectReleaseSimple(qb: SelectQueryBuilder<Release>) {
		return qb.select(['release.id', 'release.title']);
	}

	private assigneeVirtualColumn(dataFromDb: IDataFromDb) {
		return dataFromDb.entities.map((entity) => {
			const dataRawOfRelease = dataFromDb.raw.find(
				(item) => item.release_id === entity.id,
			);

			entity.tracksCount = Number(dataRawOfRelease?.tracks_count);
			entity.totalDuration = Number(dataRawOfRelease?.total_duration);

			return entity;
		});
	}

	// findOneFull;
	private createQbGetOneDetail(id: string) {
		const query = this.releaseRepo.createQueryBuilder(this.mainAlias);

		query
			.leftJoin('release.albumFormat', 'albumFormat')
			.leftJoin('release.label', 'label')

			.leftJoin('release.primaryGenre', 'primaryGenre')
			.leftJoin('release.subGenre', 'subGenre')

			.leftJoin('release.releaseCoverArts', 'releaseCoverArt')

			// artist
			.leftJoin('release.releaseArtists', 'releaseArtist')
			.leftJoin('releaseArtist.artist', 'artist')
			.leftJoinAndSelect('artist.artistProfiles', 'artistProfile')
			.leftJoinAndSelect('artistProfile.dsp', 'artistProfileDsp')
			.leftJoin('artist.genre', 'genre')
			.leftJoin('artist.country', 'country')
			// .leftJoin('releaseArtist.artistRole', 'artistRole')

			// contributor
			.leftJoin('release.releaseContributors', 'releaseContributor')
			.leftJoin('releaseContributor.artist', 'artistContributor')
			.leftJoinAndSelect(
				'artistContributor.artistProfiles',
				'artistContributorProfiles',
			)
			.leftJoinAndSelect(
				'artistContributorProfiles.dsp',
				'artistContributorProfilesDsp',
			)

			.leftJoin('releaseContributor.artistRole', 'artistRoleContributor')
			.leftJoin('artistContributor.genre', 'genreContributor')
			.leftJoin('artistContributor.country', 'countryContributor')

			.leftJoin('release.releaseLanguage', 'releaseLanguage')

			.leftJoin('releaseLanguage.metadataLanguage', 'metadataLanguage')
			.leftJoin('releaseLanguage.audioLanguage', 'audioLanguage')
			.leftJoin(
				'releaseLanguage.metadataLanguageCountry',
				'metadataLanguageCountry',
			)
			.leftJoin('release.timeZone', 'timeZone')
			.leftJoin('release.releaseTerritory', 'releaseTerritory')
			.leftJoin('release.video', 'video')
			.leftJoin('video.videoFile', 'videoFile')
			.leftJoin('video.videoArtists', 'videoArtist')
			.leftJoin('videoArtist.artist', 'videoArtistEntity')
			.leftJoin('video.videoContributors', 'videoContributor')
			.leftJoin('videoContributor.artist', 'videoContributorArtist')
			.leftJoin('videoContributor.artistRole', 'videoContributorRole')

			.leftJoin('release.modifier', 'modifier')

			.addSelect([
				'albumFormat.id',
				'albumFormat.name',
				'albumFormat.code',
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

			// artist
			.addSelect([
				'releaseArtist.id',
				// 'releaseArtist.artistRoleId',
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
				'artist.genreId',
				'artist.countryId',
			])
			.addSelect([
				'genre.id',
				'genre.name',
				'genre.code',
				'genre.picture',
			])
			.addSelect(['country.id', 'country.name', 'country.iso2'])
			// .addSelect(['artistRole.id', 'artistRole.name', 'artistRole.code'])

			// contributor
			.addSelect([
				'releaseContributor.id',
				'releaseContributor.artistRoleId',
				'releaseContributor.artistId',
				'releaseContributor.releaseId',
				'releaseContributor.addContributorToTracks',
				'releaseContributor.createdAt',
			])
			.addSelect([
				'artistContributor.id',
				'artistContributor.name',
				'artistContributor.code',
				'artistContributor.picture',
				'artistContributor.biography',
				'artistContributor.genreId',
				'artistContributor.countryId',
			])
			.addSelect([
				'artistRoleContributor.id',
				'artistRoleContributor.name',
				'artistRoleContributor.code',
			])
			.addSelect([
				'genreContributor.id',
				'genreContributor.name',
				'genreContributor.code',
				'genreContributor.picture',
			])
			.addSelect([
				'countryContributor.id',
				'countryContributor.name',
				'countryContributor.iso2',
			])

			// language
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
			.addSelect([
				'video.id',
				'video.releaseId',
				'video.isrc',
				'video.explicit',
				'video.isAi',
				'video.channel',
				'video.description',
				'video.keywords',
				'video.isKids',
				'video.isUnlisted',
				'video.subtitles',
				'video.contentProvider',
				'video.copyrightOwner',
				'video.partnerCustomId1',
				'video.partnerCustomId2',
				'video.fileId',
			])
			.addSelect([
				'videoFile.id',
				'videoFile.fileName',
				'videoFile.extension',
				'videoFile.fileSize',
				'videoFile.contentType',
			])
			.addSelect([
				'videoArtist.id',
				'videoArtist.artistId',
				'videoArtist.videoId',
			])
			.addSelect([
				'videoArtistEntity.id',
				'videoArtistEntity.name',
				'videoArtistEntity.code',
				'videoArtistEntity.picture',
			])
			.addSelect([
				'videoContributor.id',
				'videoContributor.artistId',
				'videoContributor.artistRoleId',
				'videoContributor.videoId',
			])
			.addSelect([
				'videoContributorArtist.id',
				'videoContributorArtist.name',
				'videoContributorArtist.code',
				'videoContributorArtist.picture',
			])
			.addSelect([
				'videoContributorRole.id',
				'videoContributorRole.name',
				'videoContributorRole.code',
			])

			.addSelect(['modifier.id', 'modifier.name', 'modifier.avatar']);

		query.where('release.id = :id', {
			id,
		});

		query.addOrderBy('releaseArtist.createdAt', 'ASC');
		query.addOrderBy('releaseContributor.createdAt', 'ASC');
		query.addOrderBy('artistProfileDsp.name', 'ASC');
		query.addOrderBy('artistContributorProfilesDsp.name', 'ASC');

		return query;
	}

	async getOneDetail(id: string): Promise<Release> {
		const qb = this.createQbGetOneDetail(id);
		const release = await qb.getOne();

		if (!release) {
			throw ReleaseException.NOT_FOUND();
		}

		return release;
	}

	// async findOneFull(id: string): Promise<Release> {
	// 	const qb = this.findOneFull(id);
	// 	const release = await qb.getOne();

	// 	if (!release) {
	// 		throw ReleaseException.NOT_FOUND();
	// 	}

	// 	return release;
	// }

	// private
	private filterByQuery(
		queryBuilder: SelectQueryBuilder<Release>,
		query: QueryGetListReleaseDto,
	) {
		const {
			keyword,
			ids,

			startCreatedAt,
			endCreatedAt,
			startUpdatedAt,
			endUpdatedAt,

			startDateRelease,
			endDateRelease,

			type,
			albumFormatId,
			status,
			primaryGenreId,
			subGenreId,
			labelId,
			artistId,
			isVariousArtist,
			tenantIds,

			fieldOrder,
			orderBy,

			skip,
			pageSize,
		} = query;

		if (ids && ids.length > 0) {
			queryBuilder.andWhere(`release.id IN (:...ids)`, { ids });
		}

		if (keyword) {
			queryBuilder.andWhere(
				new Brackets((qb) => {
					qb.where('release.title ILIKE :keyword')
						.orWhere('albumFormat.name ILIKE :keyword')
						.orWhere('artist.name ILIKE :keyword')
						.orWhere('label.name ILIKE :keyword')
						.orWhere('release.upc ILIKE :keyword')
						.orWhere(
							'CAST(release.status AS VARCHAR) ILIKE :keyword',
						);
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

		if (type) {
			queryBuilder.andWhere('release.type = :type', { type });
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

		if (tenantIds?.length) {
			queryBuilder.andWhere('release.tenantId IN (:...tenantIds)', {
				tenantIds,
			});
		} else {
			queryBuilder
				.leftJoin('release.tenant', 'tenant')
				.addSelect(['tenant.id', 'tenant.name']);
		}

		if (VirtualColumnReleaseArr.includes(fieldOrder)) {
			queryBuilder.orderBy(`${fieldOrder}`, orderBy);
		} else {
			queryBuilder.orderBy(`release.${fieldOrder}`, orderBy);
		}

		queryBuilder.skip(skip).take(pageSize);

		return queryBuilder;
	}

	private leftJoin(queryBuilder: SelectQueryBuilder<Release>) {
		queryBuilder
			.leftJoin('release.albumFormat', 'albumFormat')
			.leftJoin('release.releaseCoverArts', 'releaseCoverArt')

			// artist
			.leftJoin('release.releaseArtists', 'releaseArtist')
			.leftJoin('releaseArtist.artist', 'artist')
			// .leftJoin('releaseArtist.artistRole', 'artistRole')

			// contributor
			.leftJoin('release.releaseContributors', 'releaseContributor')
			.leftJoin('releaseContributor.artist', 'artistContributor')
			.leftJoin('releaseContributor.artistRole', 'artistRoleContributor')

			.leftJoin('release.label', 'label');
	}

	private select(
		queryBuilder: SelectQueryBuilder<Release>,
		query: QueryGetListReleaseDto,
	) {
		const { tenantIds } = query;

		queryBuilder
			.addSelect([
				'albumFormat.id',
				'albumFormat.name',
				'albumFormat.code',
			])
			.addSelect([
				'releaseCoverArt.id',
				'releaseCoverArt.fileId',
				'releaseCoverArt.releaseId',
				'releaseCoverArt.width',
				'releaseCoverArt.height',
				'releaseCoverArt.type',
			])

			// artist
			.addSelect([
				'releaseArtist.id',
				// 'releaseArtist.artistRoleId',
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
			// .addSelect(['artistRole.id', 'artistRole.name', 'artistRole.code'])

			// contributor
			.addSelect([
				'releaseContributor.id',
				'releaseContributor.artistRoleId',
				'releaseContributor.artistId',
				'releaseContributor.releaseId',
				'releaseContributor.addContributorToTracks',
			])
			.addSelect([
				'artistContributor.id',
				'artistContributor.name',
				'artistContributor.code',
				'artistContributor.picture',
				'artistContributor.biography',
			])
			.addSelect([
				'artistRoleContributor.id',
				'artistRoleContributor.name',
				'artistRoleContributor.code',
			])

			// label
			.addSelect([
				'label.id',
				'label.name',
				'label.code',
				'label.picture',
				'label.description',
			])

			// virtual
			.addSelect((subQuery) => {
				subQuery
					.select('COUNT(DISTINCT(track_sub1.id))')
					.from('tracks', 'track_sub1')
					.where('track_sub1.release_id = release.id');

				if (tenantIds?.length) {
					subQuery.andWhere('release.tenant_id IN (:...tenantIds)', {
						tenantIds,
					});
				}

				return subQuery;
			}, VirtualColumnRelease.TRACKS_COUNT)

			.addSelect((subQuery) => {
				subQuery
					.select('SUM(DISTINCT(audio_files_sub2.duration))')
					.from('tracks', 'track_sub2')
					.leftJoin(
						'audio_files',
						'audio_files_sub2',
						'audio_files_sub2.track_id = track_sub2.id',
					)
					.where('track_sub2.release_id = release.id');

				if (tenantIds?.length) {
					subQuery.andWhere('release.tenant_id IN (:...tenantIds)', {
						tenantIds,
					});
				}

				return subQuery;
			}, VirtualColumnRelease.TOTAL_DURATION);
	}

	async findOneWithRelation(id: string) {
		const release = await this.releaseRepo.findOne({
			where: { id },
			relations: {
				albumFormat: true,
				releaseCoverArts: true,
				releaseArtists: true,
				releaseLanguage: {
					audioLanguage: true,
				},
				releaseContributors: {
					artistRole: true,
				},
				tracks: {
					trackLanguage: {
						audioLanguage: true,
					},
					audioFile: true,
					trackArtists: true,
					trackContributors: {
						artistRole: true,
					},
				},
				releaseTerritory: true,
			},
		});

		if (!release) {
			throw ReleaseException.NOT_FOUND();
		}

		release.sortTracksByOrderAsc();
		return release;
	}

	async getFileIdAssetsRelease(id: string) {
		const release = await this.releaseRepo.findOne({
			where: { id },
			relations: {
				tracks: {
					audioFile: true,
				},
				releaseCoverArts: {
					file: true,
				},
			},
		});

		if (!release) {
			throw ReleaseException.NOT_FOUND();
		}

		const coverArtOriginal = release.releaseCoverArts?.find(
			(i) => i.type === 'original',
		);

		return {
			releaseName: release.title,

			coverArt: {
				fileId: coverArtOriginal?.fileId,
				name: `${release.title}.${coverArtOriginal?.file.extension}`,
			},
			listAudios: release.tracks.map((item) => ({
				fileId: item.audioFile?.fileId,
				name: `${item.title}.wav`,
			})),
		};
	}

	private createQbMetadata(id: string) {
		const qb = this.releaseRepo
			.createQueryBuilder('r')
			.leftJoin('r.label', 'l')
			.leftJoin('r.albumFormat', 'af')
			.leftJoin('r.releaseArtists', 'ra')
			.leftJoin('ra.artist', 'a')
			.leftJoin('ra.artistRole', 'r2')
			.leftJoin('r.primaryGenre', 'g')
			.leftJoin('r.subGenre', 'g2')
			.leftJoin('r.tracks', 't')
			.leftJoin('t.trackOriginType', 'tot')
			.leftJoin('t.trackType', 'tt')
			.leftJoin('t.primaryGenre', 'g3')
			.leftJoin('t.subGenre', 'g4')
			.where('r.id = :id', { id })
			.select([
				'r.title AS release_name',
				'af.name AS release_type_name',
				'g.name AS release_primary_genre_name',
				'g2.name AS release_sub_genre_name',
				'l.name AS label_name',
				'a.name AS artist_name',
				'r2.name AS role_name',
				't.title AS track_name',
				'tot.name AS track_origin_type_name',
				'tt.name AS track_type_name',
				'g3.name AS track_primary_genre_name',
				'g4.name AS track_sub_genre_name',
			]);

		return qb;
	}

	async getMetadata(id: string) {
		const qb = this.createQbGetOneDetail(id);
		qb.leftJoinAndSelect('release.tracks', 'track')
			.leftJoinAndSelect('track.trackArtists', 'trackArtist')
			.leftJoinAndSelect('trackArtist.artistRole', 'trackArtistRole')
			.leftJoinAndSelect('trackArtist.artist', 'trackArtistArtist')
			.addSelect(['track.id', 'track.title', 'track.isrc']);
		const release = await qb.getOne();

		if (!release) {
			throw ReleaseException.NOT_FOUND();
		}

		return release;
	}

	async getMetadataRaw(id: string) {
		const qb = this.createQbMetadata(id);
		const raw = await qb.getRawOne();

		if (!raw) {
			throw ReleaseException.NOT_FOUND();
		}

		return toSnakeCaseKeys(raw);
	}

	async findOneReleaseFull1({
		releaseId,
		relations,
	}: {
		releaseId: string;
		relations?: string[];
	}): Promise<Release> {
		const qb = this.releaseRepo
			.createQueryBuilder('release')
			.where('release.id = :releaseId', { releaseId });

		this.joinFull({ qb, relations });

		const release = await qb.getOne();

		if (!release) {
			throw ReleaseException.NOT_FOUND();
		}

		release.tracks = release.tracks ?? [];
		release.releaseArtists = release.releaseArtists ?? [];
		release.releaseCoverArts = release.releaseCoverArts ?? [];

		return release;
	}

	async findOneReleaseFull({
		releaseId,
		relations,
	}: {
		releaseId: string;
		relations?: string[];
	}): Promise<Release> {
		// Query 1: release + các relation phẳng (không nhân rows)
		const release = await this.releaseRepo
			.createQueryBuilder('release')
			.leftJoinAndSelect('release.label', 'label')
			.leftJoinAndSelect('release.primaryGenre', 'releasePrimaryGenre')
			.leftJoinAndSelect('release.subGenre', 'releaseSubGenre')
			.leftJoinAndSelect('release.releaseLanguage', 'releaseLanguage')
			.leftJoinAndSelect('releaseLanguage.audioLanguage', 'audioLanguage')
			.leftJoinAndSelect(
				'releaseLanguage.metadataLanguage',
				'releaseMetadataLanguage',
			)
			.leftJoinAndSelect('release.releaseTerritory', 'releaseTerritory')
			.leftJoinAndSelect('release.albumFormat', 'albumFormat')
			.leftJoinAndSelect('release.priceTier', 'releasePriceTier')
			.leftJoinAndSelect('releasePriceTier.currency', 'releaseCurrency')
			.leftJoinAndSelect('release.releaseCoverArts', 'releaseCoverArts')
			.leftJoinAndSelect('release.video', 'video')
			.leftJoinAndSelect('video.videoFile', 'videoFile')
			.leftJoinAndSelect('video.videoArtists', 'videoArtists')
			.leftJoinAndSelect('videoArtists.artist', 'videoArtist')
			.leftJoinAndSelect('video.videoContributors', 'videoContributors')
			.leftJoinAndSelect('videoContributors.artist', 'videoContributor')
			.leftJoinAndSelect(
				'videoContributors.artistRole',
				'videoContributorRole',
			)
			.where('release.id = :releaseId', { releaseId })
			.getOne();

		if (!release) throw ReleaseException.NOT_FOUND();

		// Query 2: release artists + profiles (tách riêng tránh nhân với tracks)
		const releaseWithArtists = await this.releaseRepo
			.createQueryBuilder('release')
			.leftJoinAndSelect('release.releaseArtists', 'releaseArtists')
			.leftJoinAndSelect('releaseArtists.artist', 'releaseArtist')
			.leftJoinAndSelect(
				'releaseArtist.artistProfiles',
				'releaseArtistProfile',
			)
			.leftJoinAndSelect(
				'releaseArtistProfile.dsp',
				'releaseArtistProfileDsp',
			)
			.leftJoinAndSelect(
				'release.releaseContributors',
				'releaseContributors',
			)
			.leftJoinAndSelect(
				'releaseContributors.artistRole',
				'releaseContributorRole',
			)
			.leftJoinAndSelect(
				'releaseContributors.artist',
				'releaseContributorArtist',
			)
			.where('release.id = :releaseId', { releaseId })
			.getOne();

		// Query 3: tracks + tất cả relation của track
		const tracks = await this.trackRepo
			.createQueryBuilder('track')
			.leftJoinAndSelect('track.audioFile', 'audioFile')
			.leftJoinAndSelect('track.priceTier', 'priceTier')
			.leftJoinAndSelect('priceTier.currency', 'currency')
			.leftJoinAndSelect('track.primaryGenre', 'trackPrimaryGenre')
			.leftJoinAndSelect('track.subGenre', 'trackSubGenre')
			.leftJoinAndSelect('track.trackSensitive', 'trackSensitive')
			.leftJoinAndSelect('track.trackLanguage', 'trackLanguage')
			.leftJoinAndSelect('trackLanguage.audioLanguage', 't_audioLanguage')
			.leftJoinAndSelect(
				'trackLanguage.metadataLanguage',
				'trackMetadataLanguage',
			)
			.leftJoinAndSelect('track.trackArtists', 'trackArtists')
			.leftJoinAndSelect('trackArtists.artist', 'trackArtist')
			.leftJoinAndSelect(
				'trackArtist.artistProfiles',
				'trackArtistProfile',
			)
			.leftJoinAndSelect(
				'trackArtistProfile.dsp',
				'trackArtistProfileDsp',
			)
			.leftJoinAndSelect('track.trackContributors', 'trackContributors')
			.leftJoinAndSelect(
				'trackContributors.artistRole',
				'contributorRole',
			)
			.leftJoinAndSelect('trackContributors.artist', 'contributorArtist')
			.leftJoinAndSelect(
				'contributorArtist.artistProfiles',
				'contributorArtistProfile',
			)
			.leftJoinAndSelect(
				'contributorArtistProfile.dsp',
				'contributorArtistProfileDsp',
			)
			.where('track.release_id = :releaseId', { releaseId })
			.orderBy('track.order', 'ASC')
			.getMany();

		// Query 4: optional DSP deliveries
		if (relations?.includes('release.releaseDspDeliveries')) {
			const releaseWithDsp = await this.releaseRepo
				.createQueryBuilder('release')
				.leftJoinAndSelect(
					'release.releaseDspDeliveries',
					'releaseDspDelivery',
				)
				.leftJoinAndSelect(
					'releaseDspDelivery.dsp',
					'releaseDspDeliveryDsp',
				)
				.leftJoinAndSelect(
					'releaseDspDeliveryDsp.dspRoutingConfig',
					'dspRoutingConfig',
				)
				.leftJoinAndSelect('dspRoutingConfig.aggregator', 'aggregator')
				.where('release.id = :releaseId', { releaseId })
				.getOne();

			release.releaseDspDeliveries =
				releaseWithDsp?.releaseDspDeliveries ?? [];
		}

		// Assemble
		release.releaseArtists = releaseWithArtists?.releaseArtists ?? [];
		release.releaseContributors =
			releaseWithArtists?.releaseContributors ?? [];
		release.tracks = tracks ?? [];

		return release;
	}

	async getListFull(query: QueryGetListReleaseDto) {
		const qb = this.releaseRepo.createQueryBuilder('release');
		this.joinFull({ qb });
		this.filterByQuery(qb, query);

		const [items, totalItems] = await qb.getManyAndCount();

		return { items, totalItems };
	}

	private joinFull({
		qb,
		relations,
	}: {
		qb: SelectQueryBuilder<Release>;
		relations?: string[];
	}) {
		qb.leftJoinAndSelect('release.label', 'label')
			.leftJoinAndSelect('release.primaryGenre', 'releasePrimaryGenre')
			.leftJoinAndSelect('release.subGenre', 'releaseSubGenre')

			.leftJoinAndSelect('release.releaseArtists', 'releaseArtists')
			.leftJoinAndSelect('releaseArtists.artist', 'releaseArtist')

			.leftJoinAndSelect(
				'release.releaseContributors',
				'releaseContributors',
			)
			.leftJoinAndSelect(
				'releaseContributors.artistRole',
				'releaseContributorRole',
			)
			.leftJoinAndSelect(
				'releaseContributors.artist',
				'releaseContributorArtist',
			)

			.leftJoinAndSelect(
				'releaseArtist.artistProfiles',
				'releaseArtistProfile',
			)
			.leftJoinAndSelect(
				'releaseArtistProfile.dsp',
				'releaseArtistProfileDsp',
			)

			.leftJoinAndSelect('release.releaseLanguage', 'releaseLanguage')
			.leftJoinAndSelect('releaseLanguage.audioLanguage', 'audioLanguage')
			.leftJoinAndSelect(
				'releaseLanguage.metadataLanguage',
				'releaseMetadataLanguage',
			)

			.leftJoinAndSelect('release.releaseCoverArts', 'releaseCoverArts')
			.leftJoinAndSelect('release.releaseTerritory', 'releaseTerritory')
			.leftJoinAndSelect('release.albumFormat', 'albumFormat')
			.leftJoinAndSelect('release.priceTier', 'releasePriceTier')
			.leftJoinAndSelect('releasePriceTier.currency', 'releaseCurrency')
			.leftJoinAndSelect('release.video', 'video')
			.leftJoinAndSelect('video.videoFile', 'videoFile')
			.leftJoinAndSelect('video.videoArtists', 'videoArtists')
			.leftJoinAndSelect('videoArtists.artist', 'videoArtist')
			.leftJoinAndSelect('video.videoContributors', 'videoContributors')
			.leftJoinAndSelect('videoContributors.artist', 'videoContributor')
			.leftJoinAndSelect(
				'videoContributors.artistRole',
				'videoContributorRole',
			)

			.leftJoinAndSelect('release.tracks', 'track')
			.leftJoinAndSelect('track.audioFile', 'audioFile')

			.leftJoinAndSelect('track.priceTier', 'priceTier')
			.leftJoinAndSelect('priceTier.currency', 'currency')

			.leftJoinAndSelect('track.primaryGenre', 'trackPrimaryGenre')
			.leftJoinAndSelect('track.subGenre', 'trackSubGenre')

			.leftJoinAndSelect('track.trackArtists', 'trackArtists')
			.leftJoinAndSelect('trackArtists.artist', 'trackArtist')
			.leftJoinAndSelect(
				'trackArtist.artistProfiles',
				'trackArtistProfile',
			)
			.leftJoinAndSelect(
				'trackArtistProfile.dsp',
				'trackArtistProfileDsp',
			)

			.leftJoinAndSelect('track.trackSensitive', 'trackSensitive')

			.leftJoinAndSelect('track.trackLanguage', 'trackLanguage')
			.leftJoinAndSelect('trackLanguage.audioLanguage', 't_audioLanguage')
			.leftJoinAndSelect(
				'trackLanguage.metadataLanguage',
				'trackMetadataLanguage',
			)

			.leftJoinAndSelect('track.trackContributors', 'trackContributors')
			.leftJoinAndSelect(
				'trackContributors.artistRole',
				'contributorRole',
			)
			.leftJoinAndSelect('trackContributors.artist', 'contributorArtist')
			.leftJoinAndSelect(
				'contributorArtist.artistProfiles',
				'contributorArtistProfile',
			)
			.leftJoinAndSelect(
				'contributorArtistProfile.dsp',
				'contributorArtistProfileDsp',
			);

		if (relations?.includes('release.releaseDspDeliveries')) {
			qb.leftJoinAndSelect(
				'release.releaseDspDeliveries',
				'releaseDspDelivery',
			)
				.leftJoinAndSelect(
					'releaseDspDelivery.dsp',
					'releaseDspDeliveryDsp',
				)
				.leftJoinAndSelect(
					'releaseDspDeliveryDsp.dspRoutingConfig',
					'dspRoutingConfig',
				)
				.leftJoinAndSelect('dspRoutingConfig.aggregator', 'aggregator');
		}

		qb.orderBy('track.order', 'ASC');
	}
}
