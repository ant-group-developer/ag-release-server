// import { Injectable } from '@nestjs/common';
// import { InjectRepository } from '@nestjs/typeorm';
// import { ResponseError } from 'src/common/dtos/response.dto';
// import { toSnakeCaseKeys } from 'src/utils/util';
// import { Brackets, Repository, SelectQueryBuilder } from 'typeorm';
// import { ReleaseMessages } from '../constants/release.constant';
// import { QueryGetListReleaseDto } from '../dto/release.dto';
// import { Release } from '../entities/release.entity';
// import {
// 	VirtualColumnRelease,
// 	VirtualColumnReleaseArr,
// } from '../enum/release.enum';
// interface IDataFromDb {
// 	entities: Release[];
// 	raw: {
// 		release_id: string;
// 		tracks_count: string;
// 		total_duration: string;
// 	}[];
// }

// @Injectable()
// export class ReleaseQueryService {
// 	constructor(
// 		@InjectRepository(Release)
// 		private readonly releaseRepo: Repository<Release>,
// 	) {}

// 	private createBaseQb() {
// 		return this.releaseRepo.cre;
// 	}

// 	// public
// 	async findOne(id: string): Promise<Release> {
// 		const release = await this.releaseRepo.findOne({
// 			where: { id },
// 			relations: ['releaseLanguage', 'releaseTerritory'],
// 		});

// 		if (!release) {
// 			throw new ResponseError(ReleaseMessages.NOT_FOUND);
// 		}

// 		return release;
// 	}

// 	async getManyAndCount(query: QueryGetListReleaseDto) {
// 		const qb = this.releaseRepo.createQueryBuilder(this.mainAlias);

// 		this.filterByQuery(qb, query);
// 		this.leftJoin(qb);
// 		this.select(qb, query);

// 		const [dataFromDb, totalItems]: [IDataFromDb, number] =
// 			await Promise.all([qb.getRawAndEntities(), qb.getCount()]);

// 		const releases = this.assigneeVirtualColumn(dataFromDb);

// 		return {
// 			totalItems,
// 			releases,
// 		};
// 	}

// 	private assigneeVirtualColumn(dataFromDb: IDataFromDb) {
// 		return dataFromDb.entities.map((entity) => {
// 			const dataRawOfRelease = dataFromDb.raw.find(
// 				(item) => item.release_id === entity.id,
// 			);

// 			entity.tracksCount = Number(dataRawOfRelease?.tracks_count);
// 			entity.totalDuration = Number(dataRawOfRelease?.total_duration);

// 			return entity;
// 		});
// 	}

// 	private createQbGetOneDetail(id: string) {
// 		const query = this.releaseRepo.createQueryBuilder(this.mainAlias);

// 		query
// 			.leftJoin('release.albumFormat', 'albumFormat')
// 			.leftJoin('release.label', 'label')

// 			.leftJoin('release.primaryGenre', 'primaryGenre')
// 			.leftJoin('release.subGenre', 'subGenre')

// 			.leftJoin('release.releaseCoverArts', 'releaseCoverArt')

// 			.leftJoin('release.releaseArtists', 'releaseArtist')
// 			.leftJoin('releaseArtist.artist', 'artist')
// 			.leftJoin('releaseArtist.artistRole', 'artistRole')

// 			.leftJoin('release.releaseLanguage', 'releaseLanguage')

// 			.leftJoin('releaseLanguage.metadataLanguage', 'metadataLanguage')
// 			.leftJoin('releaseLanguage.audioLanguage', 'audioLanguage')
// 			.leftJoin(
// 				'releaseLanguage.metadataLanguageCountry',
// 				'metadataLanguageCountry',
// 			)
// 			.leftJoin('release.timeZone', 'timeZone')
// 			.leftJoin('release.releaseTerritory', 'releaseTerritory')

// 			.leftJoin('release.modifier', 'modifier')

// 			.addSelect([
// 				'albumFormat.id',
// 				'albumFormat.name',
// 				'albumFormat.code',
// 				'albumFormat.minTrackCount',
// 				'albumFormat.maxTrackCount',
// 			])
// 			.addSelect([
// 				'label.id',
// 				'label.name',
// 				'label.code',
// 				'label.picture',
// 				'label.description',
// 			])
// 			.addSelect([
// 				'primaryGenre.id',
// 				'primaryGenre.name',
// 				'primaryGenre.code',
// 				'primaryGenre.picture',
// 				'primaryGenre.description',
// 			])
// 			.addSelect([
// 				'subGenre.id',
// 				'subGenre.name',
// 				'subGenre.code',
// 				'subGenre.picture',
// 				'subGenre.description',
// 			])
// 			.addSelect([
// 				'releaseCoverArt.id',
// 				'releaseCoverArt.fileId',
// 				'releaseCoverArt.releaseId',
// 				'releaseCoverArt.width',
// 				'releaseCoverArt.height',
// 				'releaseCoverArt.type',
// 			])
// 			.addSelect([
// 				'releaseArtist.id',
// 				'releaseArtist.artistRoleId',
// 				'releaseArtist.artistId',
// 				'releaseArtist.releaseId',
// 				'releaseArtist.addArtistToTracks',
// 			])
// 			.addSelect([
// 				'artist.id',
// 				'artist.name',
// 				'artist.code',
// 				'artist.picture',
// 				'artist.biography',
// 			])
// 			.addSelect(['artistRole.id', 'artistRole.name', 'artistRole.code'])
// 			.addSelect([
// 				'releaseLanguage.id',
// 				'releaseLanguage.metadataLanguageCountryId',
// 				'releaseLanguage.audioLanguageId',
// 				'releaseLanguage.metadataLanguageId',
// 				'releaseLanguage.releaseId',
// 			])
// 			.addSelect([
// 				'metadataLanguage.id',
// 				'metadataLanguage.name',
// 				'metadataLanguage.code',
// 			])
// 			.addSelect([
// 				'audioLanguage.id',
// 				'audioLanguage.name',
// 				'audioLanguage.code',
// 			])
// 			.addSelect([
// 				'metadataLanguageCountry.id',
// 				'metadataLanguageCountry.name',
// 			])
// 			.addSelect([
// 				'timeZone.id',
// 				'timeZone.name',
// 				'timeZone.utc',
// 				'timeZone.zone',
// 			])
// 			.addSelect([
// 				'releaseTerritory.id',
// 				'releaseTerritory.distributeWorldwide',
// 				'releaseTerritory.distributionType',
// 				'releaseTerritory.selectedCountries',
// 			])

// 			.addSelect(['modifier.id', 'modifier.name', 'modifier.avatar']);

// 		query.where('release.id = :id', {
// 			id,
// 		});

// 		return query;
// 	}

// 	async getOneDetail(id: string): Promise<Release> {
// 		const qb = this.createQbGetOneDetail(id);
// 		const release = await qb.getOne();

// 		if (!release) {
// 			throw new ResponseError(ReleaseMessages.NOT_FOUND);
// 		}

// 		return release;
// 	}

// 	// private
// 	private filterByQuery(
// 		queryBuilder: SelectQueryBuilder<Release>,
// 		query: QueryGetListReleaseDto,
// 	) {
// 		const {
// 			keyword,

// 			startCreatedAt,
// 			endCreatedAt,
// 			startUpdatedAt,
// 			endUpdatedAt,

// 			startDateRelease,
// 			endDateRelease,

// 			albumFormatId,
// 			status,
// 			primaryGenreId,
// 			subGenreId,
// 			labelId,
// 			artistId,
// 			isVariousArtist,
// 			tenantIds,

// 			fieldOrder,
// 			orderBy,

// 			skip,
// 			pageSize,
// 		} = query;

// 		if (keyword) {
// 			queryBuilder.andWhere(
// 				new Brackets((qb) => {
// 					qb.where('release.title ILIKE :keyword')
// 						.orWhere('albumFormat.name ILIKE :keyword')
// 						.orWhere('artist.name ILIKE :keyword')
// 						.orWhere('label.name ILIKE :keyword');
// 				}),
// 				{ keyword: `%${keyword}%` },
// 			);
// 		}

// 		if (startCreatedAt && endCreatedAt) {
// 			queryBuilder.andWhere(
// 				`release.createdAt BETWEEN :startCreatedAt AND :endCreatedAt`,
// 				{
// 					startCreatedAt,
// 					endCreatedAt,
// 				},
// 			);
// 		}

// 		if (startUpdatedAt && endUpdatedAt) {
// 			queryBuilder.andWhere(
// 				`release.updatedAt BETWEEN :startUpdatedAt AND :endUpdatedAt`,
// 				{
// 					startUpdatedAt,
// 					endUpdatedAt,
// 				},
// 			);
// 		}

// 		if (startDateRelease && endDateRelease) {
// 			queryBuilder.andWhere(
// 				`release.releaseDate BETWEEN :startDateRelease AND :endDateRelease`,
// 				{
// 					startDateRelease,
// 					endDateRelease,
// 				},
// 			);
// 		}

// 		if (albumFormatId?.length) {
// 			queryBuilder.andWhere(
// 				'release.albumFormatId IN (:...albumFormatId)',
// 				{
// 					albumFormatId,
// 				},
// 			);
// 		}

// 		if (primaryGenreId?.length) {
// 			queryBuilder.andWhere(
// 				'release.primaryGenreId IN (:...primaryGenreId)',
// 				{
// 					primaryGenreId,
// 				},
// 			);
// 		}

// 		if (subGenreId?.length) {
// 			queryBuilder.andWhere('release.subGenreId IN (:...subGenreId)', {
// 				subGenreId,
// 			});
// 		}

// 		if (labelId?.length) {
// 			queryBuilder.andWhere('release.labelId IN (:...labelId)', {
// 				labelId,
// 			});
// 		}

// 		if (artistId?.length) {
// 			queryBuilder.andWhere('releaseArtist.artistId IN (:...artistId)', {
// 				artistId,
// 			});
// 		}

// 		if (status?.length) {
// 			queryBuilder.andWhere('release.status IN (:...status)', {
// 				status,
// 			});
// 		}

// 		if (isVariousArtist !== undefined) {
// 			queryBuilder.andWhere(
// 				'release.isVariousArtist = :isVariousArtist',
// 				{
// 					isVariousArtist,
// 				},
// 			);
// 		}

// 		if (tenantIds?.length) {
// 			queryBuilder.andWhere('release.tenantId IN (:...tenantIds)', {
// 				tenantIds,
// 			});
// 		} else {
// 			queryBuilder
// 				.leftJoin('release.tenant', 'tenant')
// 				.addSelect(['tenant.id', 'tenant.name']);
// 		}

// 		if (VirtualColumnReleaseArr.includes(fieldOrder)) {
// 			queryBuilder.orderBy(`${fieldOrder}`, orderBy);
// 		} else {
// 			queryBuilder.orderBy(`release.${fieldOrder}`, orderBy);
// 		}

// 		queryBuilder.skip(skip).take(pageSize);

// 		return queryBuilder;
// 	}

// 	private leftJoin(queryBuilder: SelectQueryBuilder<Release>) {
// 		queryBuilder
// 			.leftJoin('release.albumFormat', 'albumFormat')
// 			.leftJoin('release.releaseCoverArts', 'releaseCoverArt')
// 			.leftJoin('release.releaseArtists', 'releaseArtist')
// 			.leftJoin('releaseArtist.artist', 'artist')
// 			.leftJoin('releaseArtist.artistRole', 'artistRole')
// 			.leftJoin('release.label', 'label');
// 	}

// 	private select(
// 		queryBuilder: SelectQueryBuilder<Release>,
// 		query: QueryGetListReleaseDto,
// 	) {
// 		const { tenantIds } = query;

// 		queryBuilder
// 			.addSelect([
// 				'albumFormat.id',
// 				'albumFormat.name',
// 				'albumFormat.code',
// 				'albumFormat.minTrackCount',
// 				'albumFormat.maxTrackCount',
// 			])
// 			.addSelect([
// 				'releaseCoverArt.id',
// 				'releaseCoverArt.fileId',
// 				'releaseCoverArt.releaseId',
// 				'releaseCoverArt.width',
// 				'releaseCoverArt.height',
// 				'releaseCoverArt.type',
// 			])
// 			.addSelect([
// 				'releaseArtist.id',
// 				'releaseArtist.artistRoleId',
// 				'releaseArtist.artistId',
// 				'releaseArtist.releaseId',
// 				'releaseArtist.addArtistToTracks',
// 			])
// 			.addSelect([
// 				'artist.id',
// 				'artist.name',
// 				'artist.code',
// 				'artist.picture',
// 				'artist.biography',
// 			])
// 			.addSelect(['artistRole.id', 'artistRole.name', 'artistRole.code'])
// 			.addSelect([
// 				'label.id',
// 				'label.name',
// 				'label.code',
// 				'label.picture',
// 				'label.description',
// 			])

// 			// virtual
// 			.addSelect((subQuery) => {
// 				subQuery
// 					.select('COUNT(DISTINCT(track_sub1.id))')
// 					.from('tracks', 'track_sub1')
// 					.where('track_sub1.release_id = release.id');

// 				if (tenantIds?.length) {
// 					subQuery.andWhere('release.tenant_id IN (:...tenantIds)', {
// 						tenantIds,
// 					});
// 				}

// 				return subQuery;
// 			}, VirtualColumnRelease.TRACKS_COUNT)

// 			.addSelect((subQuery) => {
// 				subQuery
// 					.select('SUM(DISTINCT(audio_files_sub2.duration))')
// 					.from('tracks', 'track_sub2')
// 					.leftJoin(
// 						'audio_files',
// 						'audio_files_sub2',
// 						'audio_files_sub2.track_id = track_sub2.id',
// 					)
// 					.where('track_sub2.release_id = release.id');

// 				if (tenantIds?.length) {
// 					subQuery.andWhere('release.tenant_id IN (:...tenantIds)', {
// 						tenantIds,
// 					});
// 				}

// 				return subQuery;
// 			}, VirtualColumnRelease.TOTAL_DURATION);
// 	}

// 	async findOneWithRelation(id: string) {
// 		const release = await this.releaseRepo.findOne({
// 			where: { id },
// 			relations: {
// 				albumFormat: true,
// 				releaseCoverArts: true,
// 				releaseArtists: {
// 					artistRole: true,
// 				},
// 				releaseLanguage: true,
// 				tracks: {
// 					trackLanguage: true,
// 					audioFile: true,
// 					trackArtists: {
// 						artistRole: true,
// 					},
// 				},
// 				releaseTerritory: true,
// 			},
// 		});

// 		if (!release) {
// 			throw new ResponseError(ReleaseMessages.NOT_FOUND);
// 		}

// 		return release;
// 	}

// 	async getFileIdAssetsRelease(id: string) {
// 		const release = await this.releaseRepo.findOne({
// 			where: { id },
// 			relations: {
// 				tracks: {
// 					audioFile: true,
// 				},
// 				releaseCoverArts: {
// 					file: true,
// 				},
// 			},
// 		});

// 		if (!release) {
// 			throw new ResponseError(ReleaseMessages.NOT_FOUND);
// 		}

// 		const coverArtOriginal = release.releaseCoverArts?.find(
// 			(i) => i.type === 'original',
// 		);

// 		return {
// 			releaseName: release.title,

// 			coverArt: {
// 				fileId: coverArtOriginal?.fileId,
// 				name: `${release.title}.${coverArtOriginal?.file.extension}`,
// 			},
// 			listAudios: release.tracks.map((item) => ({
// 				fileId: item.audioFile?.fileId,
// 				name: `${item.title}.wav`,
// 			})),
// 		};
// 	}

// 	private createQbMetadata(id: string) {
// 		const qb = this.releaseRepo
// 			.createQueryBuilder('r')
// 			.leftJoin('r.label', 'l')
// 			.leftJoin('r.albumFormat', 'af')
// 			.leftJoin('r.releaseArtists', 'ra')
// 			.leftJoin('ra.artist', 'a')
// 			.leftJoin('ra.artistRole', 'r2')
// 			.leftJoin('r.primaryGenre', 'g')
// 			.leftJoin('r.subGenre', 'g2')
// 			.leftJoin('r.tracks', 't')
// 			.leftJoin('t.trackOriginType', 'tot')
// 			.leftJoin('t.trackType', 'tt')
// 			.leftJoin('t.primaryGenre', 'g3')
// 			.leftJoin('t.subGenre', 'g4')
// 			.where('r.id = :id', { id })
// 			.select([
// 				'r.title AS release_name',
// 				'af.name AS release_type_name',
// 				'g.name AS release_primary_genre_name',
// 				'g2.name AS release_sub_genre_name',
// 				'l.name AS label_name',
// 				'a.name AS artist_name',
// 				'r2.name AS role_name',
// 				't.title AS track_name',
// 				'tot.name AS track_origin_type_name',
// 				'tt.name AS track_type_name',
// 				'g3.name AS track_primary_genre_name',
// 				'g4.name AS track_sub_genre_name',
// 			]);

// 		return qb;
// 	}

// 	async getMetadata(id: string) {
// 		const qb = this.createQbGetOneDetail(id);
// 		qb.leftJoinAndSelect('release.tracks', 'track')
// 			.leftJoinAndSelect('track.trackArtists', 'trackArtist')
// 			.leftJoinAndSelect('trackArtist.artistRole', 'trackArtistRole')
// 			.leftJoinAndSelect('trackArtist.artist', 'trackArtistArtist')
// 			.addSelect(['track.id', 'track.title', 'track.isrc']);
// 		const release = await qb.getOne();

// 		if (!release) {
// 			throw new ResponseError(ReleaseMessages.NOT_FOUND);
// 		}

// 		return release;
// 	}

// 	async getMetadataRaw(id: string) {
// 		const qb = this.createQbMetadata(id);
// 		const raw = await qb.getRawOne();

// 		if (!raw) {
// 			throw new ResponseError(ReleaseMessages.NOT_FOUND);
// 		}

// 		return toSnakeCaseKeys(raw);
// 	}
// }
