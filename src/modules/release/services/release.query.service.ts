import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { UserFromRequest } from 'src/modules/token/token.interface';
import { Track } from 'src/modules/track/entities/track.entity';
import { checkCanAccessTenantAll } from 'src/modules/user/utils/user-type.util';
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
	QueryReleaseDspDeliveryItemDto,
} from '../dto/release.dto';
import {
	ReleaseEnrichment,
	ReleaseEnrichmentStatus,
} from '../entities/release-enrichment.entity';
import { Release } from '../entities/release.entity';
import {
	FieldOrderRelease,
	ReleaseStatus,
	VirtualColumnRelease,
	VirtualColumnReleaseArr,
} from '../enum/release.enum';
import { ErrorSubmissionStatus } from '../modules/release-errors/entities/release-error.entity';
import { ReleaseReviewStatus } from '../modules/release-reviews/entities/release-review.entity';
import { parseJson } from '../utils/release.utils';

interface IDataFromDb {
	entities: Release[];
	raw: {
		release_id: string;
		tracks_count: string;
		total_duration: string;
		dsps_live_count: string;
		dsps_total_count: string;
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

		// filter và select sẽ trả ra mảng cần join
		const { itemsToJoin: items1 } = this.filterByQuery({ qb, query });
		const { itemsToJoin: items2 } = this.select(qb, query);

		const itemsToJoin = [...new Set([...items1, ...items2])];

		this.leftJoin({ qb, relations: itemsToJoin });

		const [dataFromDb, totalItems]: [IDataFromDb, number] =
			await Promise.all([qb.getRawAndEntities(), qb.getCount()]);

		console.log(
			`Raw rows count: ${dataFromDb.raw.length}, Entities count: ${dataFromDb.entities.length}, Total items: ${totalItems}`,
		);

		const releases = this.assigneeVirtualColumn(dataFromDb);

		return {
			totalItems,
			releases,
		};
	}

	async getManyAndCountOptimized(
		query: QueryGetListReleaseDto,
		user: UserFromRequest,
	) {
		const qbId = this.releaseRepo.createQueryBuilder(this.mainAlias);

		const { itemsToJoin } = this.filterByQuery2({ qb: qbId, query, user });

		if (itemsToJoin.includes('release.ciData')) {
			qbId.leftJoinAndSelect('release.ciData', 'releaseCiData');
		}
		if (itemsToJoin.includes('release.releaseDspDeliveries')) {
			qbId.leftJoin('release.releaseDspDeliveries', 'releaseDspDelivery');
			qbId.leftJoin('releaseDspDelivery.dsp', 'releaseDspDeliveryDsp');
		}
		if (itemsToJoin.includes('release.video')) {
			qbId.leftJoinAndSelect('release.video', 'video');
		}
		if (itemsToJoin.includes('release.releaseArtists')) {
			qbId.leftJoinAndSelect('release.releaseArtists', 'releaseArtist');
		}

		this.applyOrderFieldSelect(qbId, query.fieldOrder);

		const [releasesBase, totalItems] = await qbId.getManyAndCount();

		if (releasesBase.length === 0) {
			return { totalItems, releases: [] };
		}

		const releaseIds = releasesBase.map((r) => r.id);

		// Phase 2
		const qbDetail = this.releaseRepo.createQueryBuilder(this.mainAlias);
		qbDetail.where(`${this.mainAlias}.id IN (:...releaseIds)`, {
			releaseIds,
		});

		qbDetail
			.leftJoin('release.tenant', 'tenant')
			.addSelect(['tenant.id', 'tenant.name']);

		const { itemsToJoin: itemsDetail } = this.selectOptimized(qbDetail);

		this.addSelectJsonCoverArts(qbDetail);
		this.addSelectJsonArtists(qbDetail);
		this.addSelectJsonContributors(qbDetail);
		this.addSelectJsonDspDeliveries(qbDetail);

		this.leftJoinOptimized({
			qb: qbDetail,
			relations: [...new Set([...itemsToJoin, ...itemsDetail])],
		});

		const [dataFromDb] = await Promise.all([qbDetail.getRawAndEntities()]);

		const populatedReleases = this.assigneeVirtualColumn(dataFromDb);

		// Parse JSON arrays and map them back to entities
		for (const entity of populatedReleases) {
			const raw = dataFromDb.raw.find((r) => r.release_id === entity.id);
			if (raw) {
				entity.releaseCoverArts = parseJson(raw.releaseCoverArts_json);
				entity.releaseArtists = parseJson(raw.releaseArtists_json);
				entity.releaseContributors = parseJson(
					raw.releaseContributors_json,
				);
				entity.releaseDspDeliveries = parseJson(
					raw.releaseDspDeliveries_json,
				);
			}
		}

		// Reorder
		const releaseMap = new Map(populatedReleases.map((r) => [r.id, r]));
		const sortedReleases = releaseIds
			.map((id) => releaseMap.get(id))
			.filter(Boolean) as Release[];

		return {
			totalItems,
			releases: sortedReleases,
		};
	}

	private countDspsLiveSubQuery(subQuery: SelectQueryBuilder<any>) {
		return subQuery
			.select('COUNT(release_dsp_delivery_live_sub.id)')
			.from('release_dsp_delivery', 'release_dsp_delivery_live_sub')
			.where('release_dsp_delivery_live_sub.release_id = release.id')
			.andWhere("release_dsp_delivery_live_sub.status = 'distributed'");
	}

	private countTracksSubQuery(subQuery: SelectQueryBuilder<any>) {
		return subQuery
			.select('COUNT(track_sub1.id)')
			.from('tracks', 'track_sub1')
			.where('track_sub1.release_id = release.id');
	}

	private sumDurationSubQuery(subQuery: SelectQueryBuilder<any>) {
		return subQuery
			.select('SUM(audio_files_sub2.duration)')
			.from('tracks', 'track_sub2')
			.leftJoin(
				'audio_files',
				'audio_files_sub2',
				'audio_files_sub2.track_id = track_sub2.id',
			)
			.where('track_sub2.release_id = release.id');
	}

	private countDspsTotalSubQuery(subQuery: SelectQueryBuilder<any>) {
		return subQuery
			.select('COUNT(release_dsp_delivery_total_sub.id)')
			.from('release_dsp_delivery', 'release_dsp_delivery_total_sub')
			.where('release_dsp_delivery_total_sub.release_id = release.id');
	}

	private applyOrderFieldSelect(
		qbId: SelectQueryBuilder<Release>,
		fieldOrder?: string,
	) {
		qbId.select(`${this.mainAlias}.id`);

		if (!fieldOrder) return;

		switch (fieldOrder) {
			case FieldOrderRelease.DSPS_LIVE:
			case 'dsps_live_count':
				qbId.addSelect(this.countDspsLiveSubQuery, 'dsps_live_count');
				break;
			case FieldOrderRelease.TRACKS_COUNT:
				qbId.addSelect(
					this.countTracksSubQuery,
					FieldOrderRelease.TRACKS_COUNT,
				);
				break;
			case FieldOrderRelease.TOTAL_DURATION:
				qbId.addSelect(
					this.sumDurationSubQuery,
					FieldOrderRelease.TOTAL_DURATION,
				);
				break;
			case 'dsps_total_count':
				qbId.addSelect(this.countDspsTotalSubQuery, 'dsps_total_count');
				break;
			default:
				qbId.addSelect(`${this.mainAlias}.${fieldOrder}`);
				break;
		}
	}

	async getListSimple(query: QueryGetListReleaseDto): Promise<any> {
		const {
			idInclude,
			page,
			pageSize,
			keyword,
			type,
			isImportedFromReport,
		} = query;

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
				...(isImportedFromReport !== undefined
					? { isImportedFromReport }
					: {}),
				...(idInclude?.length ? { id: Not(In(idInclude)) } : {}),
			},
			order: { title: 'ASC' },
			skip: (page - 1) * pageSize,
			take: pageSize,
		});

		return { items: [...releaseInclude, ...items], totalItems };
	}

	private assigneeVirtualColumn(dataFromDb: IDataFromDb) {
		return dataFromDb.entities.map((entity) => {
			const dataRawOfRelease = dataFromDb.raw.find(
				(item) => item.release_id === entity.id,
			);

			entity.tracksCount = Number(dataRawOfRelease?.tracks_count);
			entity.totalDuration = Number(dataRawOfRelease?.total_duration);
			entity.dspsLiveCount = Number(
				dataRawOfRelease?.dsps_live_count ?? 0,
			);
			entity.dspsTotalCount = Number(
				dataRawOfRelease?.dsps_total_count ?? 0,
			);
			entity.dspsLive = `${entity.dspsLiveCount}/${entity.dspsTotalCount}`;

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
			.leftJoinAndSelect('release.video', 'video')
			.leftJoinAndSelect('video.channel', 'videoChannel')
			.leftJoinAndSelect('video.labelEntity', 'videoLabel')
			.leftJoin('video.videoFile', 'videoFile')
			.leftJoin('release.captions', 'releaseCaptions')
			.leftJoin('releaseCaptions.file', 'releaseCaptionFile')
			.leftJoin('releaseCaptions.language', 'releaseCaptionLanguage')
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
				'video.externalId',
				'video.label',
				'video.labelId',
				'video.explicit',
				'video.aiContent',
				'video.channelId',
				'video.description',
				'video.keywords',
				'video.madeForKids',
				'video.visibility',
				'video.contentProvider',
				'video.copyrightOwner',
				'video.partnerCustomId1',
				'video.partnerCustomId2',
				'video.fileId',
			])
			.addSelect(['videoChannel.id', 'videoChannel.name'])
			.addSelect([
				'videoFile.id',
				'videoFile.fileName',
				'videoFile.extension',
				'videoFile.fileSize',
				'videoFile.contentType',
			])
			.addSelect(['videoLabel.id', 'videoLabel.name'])
			.addSelect([
				'releaseCaptions.id',
				'releaseCaptions.releaseId',
				'releaseCaptions.languageId',
				'releaseCaptions.type',
				'releaseCaptions.fileId',
			])
			.addSelect([
				'releaseCaptionLanguage.id',
				'releaseCaptionLanguage.name',
				'releaseCaptionLanguage.code',
			])
			.addSelect([
				'releaseCaptionFile.id',
				'releaseCaptionFile.fileName',
				'releaseCaptionFile.extension',
				'releaseCaptionFile.fileSize',
				'releaseCaptionFile.contentType',
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
	private filterByQuery({
		qb,
		query,
	}: {
		qb: SelectQueryBuilder<Release>;
		query: QueryGetListReleaseDto;
	}) {
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
			channelId,
			isVariousArtist,
			isImportedFromReport,
			isEnrich,
			hasError,
			needsReview,
			tenantIds,

			ciDataStatus,
			neverExported,
			lastImportIsFailed,
			needImportAgain,
			hasQaFlag,
			dspDelivery,

			fieldOrder,
			orderBy,

			skip,
			pageSize,
		} = query;

		const itemsToJoin: string[] = [];

		if (
			ciDataStatus ||
			neverExported !== undefined ||
			lastImportIsFailed !== undefined ||
			needImportAgain !== undefined ||
			hasQaFlag !== undefined
		) {
			itemsToJoin.push('release.ciData');

			if (ciDataStatus) {
				qb.andWhere('releaseCiData.status = :ciDataStatus', {
					ciDataStatus,
				});
			}

			if (neverExported !== undefined) {
				const neverExportedCondition = `
						(
							"releaseCiData"."export_parsed_data" IS NULL
							OR jsonb_array_length("releaseCiData"."export_parsed_data") = 0
						)
					`;

				qb.andWhere(
					neverExported
						? neverExportedCondition
						: `NOT ${neverExportedCondition}`,
				);
			}

			if (lastImportIsFailed !== undefined) {
				const lastImportIsFailedCondition = `
					coalesce("releaseCiData"."import_parsed_data" ->> 'status', '') = :failedImportStatus
				`;

				qb.andWhere(
					lastImportIsFailed
						? lastImportIsFailedCondition
						: `NOT (${lastImportIsFailedCondition})`,
					{ failedImportStatus: 'problem' },
				);
			}

			if (needImportAgain !== undefined) {
				qb.andWhere(
					`"releaseCiData"."need_import_again" = :needImportAgain`,
					{ needImportAgain },
				);
			}

			if (hasQaFlag !== undefined) {
				const hasQaFlagCondition = `
					COALESCE(jsonb_array_length("releaseCiData"."qa_flags_ci"), 0) > 0
				`;

				qb.andWhere(
					hasQaFlag
						? hasQaFlagCondition
						: `(
							"releaseCiData"."id" IS NULL
							OR NOT (${hasQaFlagCondition})
						)`,
				);
			}
		}

		const dspDeliveryInclude = (dspDelivery?.include ?? []).filter(
			(item) => item?.code && item?.status?.length,
		);
		const dspDeliveryExclude = (dspDelivery?.exclude ?? []).filter(
			(item) => item?.code && item?.status?.length,
		);

		if (dspDeliveryInclude.length || dspDeliveryExclude.length) {
			itemsToJoin.push('release.releaseDspDeliveries');
		}

		if (dspDeliveryExclude.length) {
			const { condition, parameters } =
				this.buildDspDeliveryExistsCondition({
					items: dspDeliveryExclude,
					prefix: 'excludeDspDelivery',
					deliveryAlias: 'excludeDspDeliveryFilter',
					dspAlias: 'excludeDspFilter',
				});

			qb.andWhere(`NOT ${condition}`, parameters);
		}

		if (dspDeliveryInclude.length) {
			const { condition, parameters } =
				this.buildDspDeliveryExistsCondition({
					items: dspDeliveryInclude,
					prefix: 'includeDspDelivery',
					deliveryAlias: 'includeDspDeliveryFilter',
					dspAlias: 'includeDspFilter',
				});

			qb.andWhere(condition, parameters);
		}

		if (ids && ids.length > 0) {
			qb.andWhere(`release.id IN (:...ids)`, { ids });
		}

		if (keyword) {
			qb.andWhere(
				new Brackets((qb) => {
					qb.where('release.title ILIKE :keyword')
						.orWhere('albumFormat.name ILIKE :keyword')
						.orWhere('artist.name ILIKE :keyword')
						.orWhere('label.name ILIKE :keyword')
						.orWhere('release.upc ILIKE :keyword')
						.orWhere('video.isrc ILIKE :keyword')
						.orWhere(
							'CAST(release.status AS VARCHAR) ILIKE :keyword',
						);
				}),
				{ keyword: `%${keyword}%` },
			);
		}

		if (startCreatedAt && endCreatedAt) {
			qb.andWhere(
				`release.createdAt BETWEEN :startCreatedAt AND :endCreatedAt`,
				{
					startCreatedAt,
					endCreatedAt,
				},
			);
		}

		if (startUpdatedAt && endUpdatedAt) {
			qb.andWhere(
				`release.updatedAt BETWEEN :startUpdatedAt AND :endUpdatedAt`,
				{
					startUpdatedAt,
					endUpdatedAt,
				},
			);
		}

		if (startDateRelease && endDateRelease) {
			qb.andWhere(
				`release.releaseDate BETWEEN :startDateRelease AND :endDateRelease`,
				{
					startDateRelease,
					endDateRelease,
				},
			);
		}

		if (albumFormatId?.length) {
			qb.andWhere('release.albumFormatId IN (:...albumFormatId)', {
				albumFormatId,
			});
		}

		if (type) {
			qb.andWhere('release.type = :type', { type });
		}

		if (primaryGenreId?.length) {
			qb.andWhere('release.primaryGenreId IN (:...primaryGenreId)', {
				primaryGenreId,
			});
		}

		if (subGenreId?.length) {
			qb.andWhere('release.subGenreId IN (:...subGenreId)', {
				subGenreId,
			});
		}

		if (labelId?.length) {
			qb.andWhere('release.labelId IN (:...labelId)', {
				labelId,
			});
		}

		if (artistId?.length) {
			qb.andWhere('releaseArtist.artistId IN (:...artistId)', {
				artistId,
			});
		}

		if (channelId?.length) {
			qb.andWhere('video.channelId IN (:...channelId)', {
				channelId,
			});
		}

		if (status?.length) {
			qb.andWhere('release.status IN (:...status)', {
				status,
			});
		}

		if (isVariousArtist !== undefined) {
			qb.andWhere('release.isVariousArtist = :isVariousArtist', {
				isVariousArtist,
			});
		}

		if (isImportedFromReport !== undefined) {
			qb.andWhere(
				'release.isImportedFromReport = :isImportedFromReport',
				{ isImportedFromReport },
			);
		}

		if (isEnrich !== undefined) {
			qb.leftJoin(
				ReleaseEnrichment,
				'releaseEnrichmentFilter',
				'releaseEnrichmentFilter.releaseId = release.id AND releaseEnrichmentFilter.status = :successfulEnrichmentStatus',
				{ successfulEnrichmentStatus: ReleaseEnrichmentStatus.SUCCESS },
			);

			qb.andWhere(
				isEnrich
					? 'releaseEnrichmentFilter.id IS NOT NULL'
					: 'releaseEnrichmentFilter.id IS NULL',
			);
		}

		if (hasError !== undefined) {
			const openErrorCondition = `
				EXISTS (
					SELECT 1
					FROM release_errors releaseErrorFilter
					WHERE releaseErrorFilter.release_id = release.id
					AND releaseErrorFilter.submission_status = :openSubmissionStatus
				)
			`;

			qb.andWhere(
				hasError ? openErrorCondition : `NOT ${openErrorCondition}`,
				{ openSubmissionStatus: ErrorSubmissionStatus.OPEN },
			);
		}

		if (needsReview !== undefined) {
			const reviewCondition = `
				EXISTS (
					SELECT 1
					FROM release_reviews releaseReviewFilter
					WHERE releaseReviewFilter.release_id = release.id
					AND releaseReviewFilter.status IN (:...pendingReviewStatuses)
				)
			`;

			qb.andWhere(
				needsReview ? reviewCondition : `NOT ${reviewCondition}`,
				{
					pendingReviewStatuses: [
						ReleaseReviewStatus.PENDING,
						ReleaseReviewStatus.PROCESSING,
					],
				},
			);
		}

		if (tenantIds?.length) {
			qb.andWhere('release.tenantId IN (:...tenantIds)', {
				tenantIds,
			});
		} else {
			qb.leftJoin('release.tenant', 'tenant').addSelect([
				'tenant.id',
				'tenant.name',
			]);
		}

		if (fieldOrder === FieldOrderRelease.DSPS_LIVE) {
			qb.orderBy('dsps_live_count', orderBy);
		} else if (VirtualColumnReleaseArr.includes(fieldOrder)) {
			qb.orderBy(`${fieldOrder}`, orderBy);
		} else {
			qb.orderBy(`release.${fieldOrder}`, orderBy);
		}

		qb.skip(skip).take(pageSize);

		return { itemsToJoin };
	}

	private filterByQuery2({
		qb,
		query,
		user,
	}: {
		qb: SelectQueryBuilder<Release>;
		query: QueryGetListReleaseDto;
		user: UserFromRequest;
	}) {
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
			channelId,
			isVariousArtist,
			isImportedFromReport,
			isEnrich,
			hasError,
			needsReview,
			tenantIds,

			ciDataStatus,
			neverExported,
			lastImportIsFailed,
			needImportAgain,
			hasQaFlag,
			dspDelivery,
			hangingExecutionDays,
			fieldOrder,
			orderBy,

			skip,
			pageSize,
		} = query;

		const itemsToJoin: string[] = [];

		if (
			ciDataStatus ||
			neverExported !== undefined ||
			lastImportIsFailed !== undefined ||
			needImportAgain !== undefined ||
			hasQaFlag !== undefined
		) {
			itemsToJoin.push('release.ciData');

			if (ciDataStatus) {
				qb.andWhere('releaseCiData.status = :ciDataStatus', {
					ciDataStatus,
				});
			}

			if (neverExported !== undefined) {
				const neverExportedCondition = `
						(
							"releaseCiData"."export_parsed_data" IS NULL
							OR jsonb_array_length("releaseCiData"."export_parsed_data") = 0
						)
					`;

				qb.andWhere(
					neverExported
						? neverExportedCondition
						: `NOT ${neverExportedCondition}`,
				);
			}

			if (lastImportIsFailed !== undefined) {
				const lastImportIsFailedCondition = `
					coalesce("releaseCiData"."import_parsed_data" ->> 'status', '') = :failedImportStatus
				`;

				qb.andWhere(
					lastImportIsFailed
						? lastImportIsFailedCondition
						: `NOT (${lastImportIsFailedCondition})`,
					{ failedImportStatus: 'problem' },
				);
			}

			if (needImportAgain !== undefined) {
				qb.andWhere(
					`"releaseCiData"."need_import_again" = :needImportAgain`,
					{ needImportAgain },
				);
			}

			if (hasQaFlag !== undefined) {
				const hasQaFlagCondition = `
					COALESCE(jsonb_array_length("releaseCiData"."qa_flags_ci"), 0) > 0
				`;

				qb.andWhere(
					hasQaFlag
						? hasQaFlagCondition
						: `(
							"releaseCiData"."id" IS NULL
							OR NOT (${hasQaFlagCondition})
						)`,
				);
			}
		}

		if (hangingExecutionDays !== undefined) {
			qb.innerJoin(
				'release_excutions3',
				're3',
				're3.release_id = release.id',
			);
			qb.andWhere('re3.completed_at IS NULL');
			qb.andWhere(
				`re3.created_at <= NOW() - (INTERVAL '1 day' * :hangingExecutionDays)`,
				{ hangingExecutionDays },
			);
		}

		const dspDeliveryInclude = (dspDelivery?.include ?? []).filter(
			(item) => item?.code && item?.status?.length,
		);
		const dspDeliveryExclude = (dspDelivery?.exclude ?? []).filter(
			(item) => item?.code && item?.status?.length,
		);

		if (dspDeliveryExclude.length) {
			const { condition, parameters } =
				this.buildDspDeliveryExistsCondition({
					items: dspDeliveryExclude,
					prefix: 'excludeDspDelivery',
					deliveryAlias: 'excludeDspDeliveryFilter',
					dspAlias: 'excludeDspFilter',
				});

			qb.andWhere(`NOT ${condition}`, parameters);
		}

		if (dspDeliveryInclude.length) {
			const { condition, parameters } =
				this.buildDspDeliveryExistsCondition({
					items: dspDeliveryInclude,
					prefix: 'includeDspDelivery',
					deliveryAlias: 'includeDspDeliveryFilter',
					dspAlias: 'includeDspFilter',
				});

			qb.andWhere(condition, parameters);
		}

		if (ids && ids.length > 0) {
			qb.andWhere(`release.id IN (:...ids)`, { ids });
		}

		if (keyword) {
			qb.andWhere(
				new Brackets((qbInner) => {
					qbInner
						.where('release.title ILIKE :keyword')
						.orWhere('release.upc ILIKE :keyword')
						.orWhere(`release.album_format_id IN (
							SELECT albumFormatFilter.id FROM album_formats albumFormatFilter
							WHERE albumFormatFilter.name ILIKE :keyword
						)`).orWhere(`release.label_id IN (
							SELECT labelFilter.id FROM labels labelFilter
							WHERE labelFilter.name ILIKE :keyword
						)`).orWhere(`release.id IN (
							SELECT releaseArtistFilter.release_id FROM release_artist releaseArtistFilter
							JOIN artists artistFilter ON artistFilter.id = releaseArtistFilter.artist_id
							WHERE artistFilter.name ILIKE :keyword
						)`).orWhere(`release.id IN (
							SELECT videoFilter.release_id FROM videos videoFilter
							WHERE videoFilter.isrc ILIKE :keyword
						)`);
				}),
				{ keyword: `%${keyword}%` },
			);
		}

		if (startCreatedAt && endCreatedAt) {
			qb.andWhere(
				`release.createdAt BETWEEN :startCreatedAt AND :endCreatedAt`,
				{
					startCreatedAt,
					endCreatedAt,
				},
			);
		}

		if (startUpdatedAt && endUpdatedAt) {
			qb.andWhere(
				`release.updatedAt BETWEEN :startUpdatedAt AND :endUpdatedAt`,
				{
					startUpdatedAt,
					endUpdatedAt,
				},
			);
		}

		if (startDateRelease && endDateRelease) {
			qb.andWhere(
				`release.releaseDate BETWEEN :startDateRelease AND :endDateRelease`,
				{
					startDateRelease,
					endDateRelease,
				},
			);
		}

		if (albumFormatId?.length) {
			qb.andWhere('release.albumFormatId IN (:...albumFormatId)', {
				albumFormatId,
			});
		}

		if (type) {
			qb.andWhere('release.type = :type', { type });
			if (
				type === 'video' &&
				user &&
				!checkCanAccessTenantAll(user.type, user.tenantUserType)
			) {
				// Dùng Subquery: chỉ lấy các release video thuộc kênh ACTIVE mà user được phân quyền trong user_channels
				qb.andWhere(
					`release.id IN (
						SELECT v.release_id FROM videos v
						WHERE v.channel_id IN (
							SELECT uc.channel_id 
							FROM user_channels uc 
							JOIN channels c ON c.id = uc.channel_id 
							WHERE uc.user_id = :userIdFilter AND c.is_active = true
						)
					)`,
					{ userIdFilter: user.id },
				);
			}
		}

		if (primaryGenreId?.length) {
			qb.andWhere('release.primaryGenreId IN (:...primaryGenreId)', {
				primaryGenreId,
			});
		}

		if (subGenreId?.length) {
			qb.andWhere('release.subGenreId IN (:...subGenreId)', {
				subGenreId,
			});
		}

		if (labelId?.length) {
			qb.andWhere('release.labelId IN (:...labelId)', {
				labelId,
			});
		}

		if (artistId?.length) {
			itemsToJoin.push('release.releaseArtists');
			qb.andWhere('releaseArtist.artistId IN (:...artistId)', {
				artistId,
			});
		}

		if (channelId?.length) {
			itemsToJoin.push('release.video');
			qb.andWhere('video.channelId IN (:...channelId)', {
				channelId,
			});
		}

		if (status?.length) {
			qb.andWhere('release.status IN (:...status)', {
				status,
			});
		}

		if (isVariousArtist !== undefined) {
			qb.andWhere('release.isVariousArtist = :isVariousArtist', {
				isVariousArtist,
			});
		}

		if (isImportedFromReport !== undefined) {
			qb.andWhere(
				'release.isImportedFromReport = :isImportedFromReport',
				{ isImportedFromReport },
			);
		}

		if (isEnrich !== undefined) {
			const enrichExistsCondition = `EXISTS (
				SELECT 1 FROM release_enrichments releaseEnrichmentFilter
				WHERE releaseEnrichmentFilter.release_id = release.id
				AND releaseEnrichmentFilter.status = :successfulEnrichmentStatus
			)`;

			qb.andWhere(
				isEnrich
					? enrichExistsCondition
					: `NOT ${enrichExistsCondition}`,
				{ successfulEnrichmentStatus: ReleaseEnrichmentStatus.SUCCESS },
			);
		}

		if (hasError !== undefined) {
			const openErrorCondition = `
				EXISTS (
					SELECT 1
					FROM release_errors releaseErrorFilter
					WHERE releaseErrorFilter.release_id = release.id
					AND releaseErrorFilter.submission_status = :openSubmissionStatus
				)
			`;

			qb.andWhere(
				hasError ? openErrorCondition : `NOT ${openErrorCondition}`,
				{ openSubmissionStatus: ErrorSubmissionStatus.OPEN },
			);
		}

		if (needsReview !== undefined) {
			const reviewCondition = `
				EXISTS (
					SELECT 1
					FROM release_reviews releaseReviewFilter
					WHERE releaseReviewFilter.release_id = release.id
					AND releaseReviewFilter.status IN (:...pendingReviewStatuses)
				)
			`;

			qb.andWhere(
				needsReview ? reviewCondition : `NOT ${reviewCondition}`,
				{
					pendingReviewStatuses: [
						ReleaseReviewStatus.PENDING,
						ReleaseReviewStatus.PROCESSING,
					],
				},
			);
		}

		if (tenantIds?.length) {
			qb.andWhere('release.tenantId IN (:...tenantIds)', {
				tenantIds,
			});
		}

		if (fieldOrder === FieldOrderRelease.DSPS_LIVE) {
			qb.orderBy('dsps_live_count', orderBy);
		} else if (VirtualColumnReleaseArr.includes(fieldOrder)) {
			qb.orderBy(`${fieldOrder}`, orderBy);
		} else {
			qb.orderBy(`release.${fieldOrder}`, orderBy);
		}

		qb.skip(skip).take(pageSize);

		return { itemsToJoin };
	}

	private buildDspDeliveryExistsCondition({
		items,
		prefix,
		deliveryAlias,
		dspAlias,
	}: {
		items: QueryReleaseDspDeliveryItemDto[];
		prefix: string;
		deliveryAlias: string;
		dspAlias: string;
	}) {
		const parameters: Record<string, string | string[]> = {};
		const pairConditions = items.map((item, index) => {
			const codeParam = `${prefix}Code${index}`;
			const statusParam = `${prefix}Status${index}`;

			parameters[codeParam] = item.code.trim().toUpperCase();
			parameters[statusParam] = item.status;

			return `(
				UPPER(TRIM(${dspAlias}.code)) = :${codeParam}
				AND ${deliveryAlias}.status IN (:...${statusParam})
			)`;
		});

		return {
			condition: `
				EXISTS (
					SELECT 1
					FROM release_dsp_delivery ${deliveryAlias}
					INNER JOIN dsps ${dspAlias}
						ON ${dspAlias}.id = ${deliveryAlias}.dsp_id
					WHERE ${deliveryAlias}.release_id = release.id
						AND (${pairConditions.join(' OR ')})
				)
			`,
			parameters,
		};
	}

	private leftJoin({
		qb,
		relations,
	}: {
		qb: SelectQueryBuilder<Release>;
		relations?: string[];
	}) {
		qb.leftJoin('release.albumFormat', 'albumFormat')
			.leftJoin('release.releaseCoverArts', 'releaseCoverArt')

			// artist
			.leftJoin('release.releaseArtists', 'releaseArtist')
			.leftJoin('releaseArtist.artist', 'artist')
			// .leftJoin('releaseArtist.artistRole', 'artistRole')

			// contributor
			.leftJoin('release.releaseContributors', 'releaseContributor')
			.leftJoin('releaseContributor.artist', 'artistContributor')
			.leftJoin('releaseContributor.artistRole', 'artistRoleContributor')

			.leftJoin('release.label', 'label')
			.leftJoin('release.video', 'video')
			.leftJoin('video.channel', 'channel')

			// genre
			.leftJoinAndSelect('release.primaryGenre', 'primaryGenre');

		// ci data
		if (relations?.includes('release.ciData')) {
			qb.leftJoinAndSelect('release.ciData', 'releaseCiData');
		}

		// dsp delivery
		if (relations?.includes('release.releaseDspDeliveries')) {
			qb.leftJoin(
				'release.releaseDspDeliveries',
				'releaseDspDelivery',
			).leftJoin('releaseDspDelivery.dsp', 'releaseDspDeliveryDsp');
		}
	}

	private leftJoinOptimized({
		qb,
		relations,
	}: {
		qb: SelectQueryBuilder<Release>;
		relations?: string[];
	}) {
		qb.leftJoin('release.albumFormat', 'albumFormat')
			.leftJoin('release.label', 'label')
			.leftJoin('release.video', 'video')
			.leftJoin('video.channel', 'channel')
			.leftJoinAndSelect('release.primaryGenre', 'primaryGenre');

		if (relations?.includes('release.ciData')) {
			qb.leftJoinAndSelect('release.ciData', 'releaseCiData');
		}
	}

	private select(
		queryBuilder: SelectQueryBuilder<Release>,
		query: QueryGetListReleaseDto,
	) {
		const { tenantIds } = query;
		const itemsToJoin: string[] = [];

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
			.addSelect([
				'releaseDspDelivery.id',
				'releaseDspDelivery.releaseId',
				'releaseDspDelivery.dspId',
				'releaseDspDelivery.status',
				'releaseDspDelivery.isSelected',
				'releaseDspDelivery.hasLiveVersion',
				'releaseDspDelivery.lastEnqueuedAt',
				'releaseDspDelivery.lastDeliveredAt',
				'releaseDspDelivery.logs',
				'releaseDspDelivery.issues',
				'releaseDspDelivery.metadataPath',
				'releaseDspDelivery.batchId',
			])
			.addSelect([
				'releaseDspDeliveryDsp.id',
				'releaseDspDeliveryDsp.name',
				'releaseDspDeliveryDsp.code',
				'releaseDspDeliveryDsp.codeCi',
				'releaseDspDeliveryDsp.picture',
				'releaseDspDeliveryDsp.type',
			])
			.addSelect([
				'video.id',
				'video.releaseId',
				'video.channelId',
				'video.isrc',
				'video.externalId',
			])

			// channel
			.addSelect([
				'channel.id',
				'channel.name',
				'channel.youtubeChannelId',
				'channel.thumbUrl',
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
			}, VirtualColumnRelease.TOTAL_DURATION)

			.addSelect((subQuery) => {
				subQuery
					.select('COUNT(DISTINCT release_dsp_delivery_live_sub.id)')
					.from(
						'release_dsp_delivery',
						'release_dsp_delivery_live_sub',
					)
					.where(
						'release_dsp_delivery_live_sub.release_id = release.id',
					)
					.andWhere(
						"release_dsp_delivery_live_sub.status = 'distributed'",
					);

				return subQuery;
			}, 'dsps_live_count')

			.addSelect((subQuery) => {
				subQuery
					.select('COUNT(DISTINCT release_dsp_delivery_total_sub.id)')
					.from(
						'release_dsp_delivery',
						'release_dsp_delivery_total_sub',
					)
					.where(
						'release_dsp_delivery_total_sub.release_id = release.id',
					);

				return subQuery;
			}, 'dsps_total_count');

		itemsToJoin.push('release.releaseDspDeliveries');

		return { itemsToJoin };
	}

	private selectOptimized(queryBuilder: SelectQueryBuilder<Release>) {
		const itemsToJoin: string[] = [];

		queryBuilder
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
				'video.id',
				'video.releaseId',
				'video.channelId',
				'video.isrc',
				'video.externalId',
				'video.visibility',
			])
			.addSelect([
				'channel.id',
				'channel.name',
				'channel.youtubeChannelId',
				'channel.thumbUrl',
			])
			.addSelect(this.countTracksSubQuery, FieldOrderRelease.TRACKS_COUNT)
			.addSelect(
				this.sumDurationSubQuery,
				FieldOrderRelease.TOTAL_DURATION,
			)
			.addSelect(this.countDspsLiveSubQuery, 'dsps_live_count')
			.addSelect(this.countDspsTotalSubQuery, 'dsps_total_count');

		return { itemsToJoin };
	}

	private addSelectJsonCoverArts(queryBuilder: SelectQueryBuilder<Release>) {
		queryBuilder.addSelect((subQuery) => {
			return subQuery
				.select(
					`COALESCE(JSON_AGG(
					JSON_BUILD_OBJECT(
						'id', rca.id,
						'fileId', rca.file_id,
						'releaseId', rca.release_id,
						'width', rca.width,
						'height', rca.height,
						'type', rca.type
					)
				) FILTER (WHERE rca.id IS NOT NULL), '[]')`,
				)
				.from('release_cover_art', 'rca')
				.where('rca.release_id = release.id');
		}, 'releaseCoverArts_json');
	}

	private addSelectJsonArtists(queryBuilder: SelectQueryBuilder<Release>) {
		queryBuilder.addSelect((subQuery) => {
			return subQuery
				.select(
					`COALESCE(JSON_AGG(
					JSON_BUILD_OBJECT(
						'id', ra.id,
						'artistId', ra.artist_id,
						'releaseId', ra.release_id,
						'addArtistToTracks', ra.add_artist_to_tracks,
						'artist', JSON_BUILD_OBJECT(
							'id', artist.id,
							'name', artist.name,
							'code', artist.code,
							'picture', artist.picture,
							'biography', artist.biography
						)
					)
				) FILTER (WHERE ra.id IS NOT NULL), '[]')`,
				)
				.from('release_artist', 'ra')
				.leftJoin('artists', 'artist', 'artist.id = ra.artist_id')
				.where('ra.release_id = release.id');
		}, 'releaseArtists_json');
	}

	private addSelectJsonContributors(
		queryBuilder: SelectQueryBuilder<Release>,
	) {
		queryBuilder.addSelect((subQuery) => {
			return subQuery
				.select(
					`COALESCE(JSON_AGG(
					JSON_BUILD_OBJECT(
						'id', rc.id,
						'artistRoleId', rc.artist_role_id,
						'artistId', rc.artist_id,
						'releaseId', rc.release_id,
						'addContributorToTracks', rc.add_contributor_to_tracks,
						'artist', JSON_BUILD_OBJECT(
							'id', artist_c.id,
							'name', artist_c.name,
							'code', artist_c.code,
							'picture', artist_c.picture,
							'biography', artist_c.biography
						),
						'artistRole', JSON_BUILD_OBJECT(
							'id', role.id,
							'name', role.name,
							'code', role.code
						)
					)
				) FILTER (WHERE rc.id IS NOT NULL), '[]')`,
				)
				.from('release_contributors', 'rc')
				.leftJoin('artists', 'artist_c', 'artist_c.id = rc.artist_id')
				.leftJoin('artist_roles', 'role', 'role.id = rc.artist_role_id')
				.where('rc.release_id = release.id');
		}, 'releaseContributors_json');
	}

	private addSelectJsonDspDeliveries(
		queryBuilder: SelectQueryBuilder<Release>,
	) {
		queryBuilder.addSelect((subQuery) => {
			return subQuery
				.select(
					`COALESCE(JSON_AGG(
					JSON_BUILD_OBJECT(
						'id', rdd.id,
						'releaseId', rdd.release_id,
						'dspId', rdd.dsp_id,
						'status', rdd.status,
						'isSelected', rdd.is_selected,
						'hasLiveVersion', rdd.has_live_version,
						'lastEnqueuedAt', rdd.last_enqueued_at,
						'lastDeliveredAt', rdd.last_delivered_at,
						'logs', rdd.logs,
						'issues', rdd.issues,
						'metadataPath', rdd.metadata_path,
						'batchId', rdd.batch_id,
						'dsp', JSON_BUILD_OBJECT(
							'id', dsp.id,
							'name', dsp.name,
							'code', dsp.code,
							'codeCi', dsp.code_ci,
							'picture', dsp.picture,
							'type', dsp.type,
							'isActive', dsp.is_active
						)
					)
				) FILTER (WHERE rdd.id IS NOT NULL), '[]')`,
				)
				.from('release_dsp_delivery', 'rdd')
				.leftJoin('dsps', 'dsp', 'dsp.id = rdd.dsp_id')
				.where('rdd.release_id = release.id');
		}, 'releaseDspDeliveries_json');
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
			.leftJoinAndSelect('video.channel', 'videoChannel')
			.leftJoinAndSelect('video.labelEntity', 'videoLabel')
			.leftJoinAndSelect('video.videoFile', 'videoFile')
			.leftJoinAndSelect('release.captions', 'releaseCaptions')
			.leftJoinAndSelect('releaseCaptions.file', 'releaseCaptionFile')
			.leftJoinAndSelect(
				'releaseCaptions.language',
				'releaseCaptionLanguage',
			)
			.leftJoinAndSelect('video.videoArtists', 'videoArtists')
			.leftJoinAndSelect('videoArtists.artist', 'videoArtist')
			.leftJoinAndSelect('video.videoContributors', 'videoContributors')
			.leftJoinAndSelect('videoContributors.artist', 'videoContributor')
			.leftJoinAndSelect(
				'videoContributors.artistRole',
				'videoContributorRole',
			)

			.leftJoinAndSelect('release.timeZone', 'timeZone')
			.leftJoinAndSelect('release.ciData', 'releaseCiData')

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
		this.filterByQuery({ qb, query });

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
			.leftJoinAndSelect('release.timeZone', 'timeZone')
			.leftJoinAndSelect('release.ciData', 'releaseCiData')
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
			.leftJoinAndSelect('video.channel', 'videoChannel')
			.leftJoinAndSelect('video.videoFile', 'videoFile')
			.leftJoinAndSelect('release.captions', 'releaseCaptions')
			.leftJoinAndSelect('releaseCaptions.file', 'releaseCaptionFile')
			.leftJoinAndSelect(
				'releaseCaptions.language',
				'releaseCaptionLanguage',
			)
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
