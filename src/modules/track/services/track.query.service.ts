import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/common.response.dto';
import { AppConfigService } from 'src/modules/app-config/app-config.service';
import { Genre } from 'src/modules/genre/entities/genre.entity';
import { orderAndPaging2 } from 'src/modules/orm/utils/orm.utils';
import { PriceTier } from 'src/modules/price-tiers/entities/price-tier.entity';
import { PriceTierType } from 'src/modules/price-tiers/enum/price-tier.enum';
import { Release } from 'src/modules/release/entities/release.entity';
import { TrackOriginType } from 'src/modules/track-origin-type/entities/track-origin-type.entity';
import { TrackSensitive } from 'src/modules/track-sensitive/entities/track-sensitive.entity';
import { TrackType } from 'src/modules/track-type/entities/track-type.entity';
import {
	Brackets,
	ILike,
	In,
	Not,
	Repository,
	SelectQueryBuilder,
} from 'typeorm';
import { TrackMessages } from '../constants/track.constant';
import {
	BulkCreateTrackDraft,
	UpdateTrackDraftDto,
} from '../dto/track.draft.dto';
import { QueryGetListTrackDto } from '../dto/track.dto';
import { Track } from '../entities/track.entity';
import {
	IHandleCreateTrackOne,
	ITrack,
	ITrackDraft,
	ITrackNonDraft,
} from '../interfaces/track.interface';

@Injectable()
export class TrackQueryService {
	constructor(
		private readonly appConfigService: AppConfigService,

		@InjectRepository(Track)
		private readonly trackRepo: Repository<Track>,

		@InjectRepository(Genre)
		private readonly genreRepo: Repository<Genre>,

		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,

		@InjectRepository(TrackType)
		private readonly trackTypeRepo: Repository<TrackType>,

		@InjectRepository(TrackOriginType)
		private readonly trackOriginTypeRepo: Repository<TrackOriginType>,

		@InjectRepository(PriceTier)
		private readonly priceTierRepo: Repository<PriceTier>,

		@InjectRepository(TrackSensitive)
		private readonly trackSensitiveRepo: Repository<TrackSensitive>,
	) {}

	// public
	async getList(query: QueryGetListTrackDto) {
		const qb = this.createQueryGetList(query);
		return await qb.getManyAndCount();
	}

	async getList2(query: QueryGetListTrackDto): Promise<[Track[], number]> {
		// BƯỚC 1: LỌC & PHÂN TRANG
		const qbId = this.createBaseQb();

		if (query.tenantIds?.length || query.labelId?.length) {
			qbId.leftJoin('track.release', 'release');
		}
		if (query.artistId?.length) {
			qbId.leftJoin('track.trackArtists', 'trackArtist');
		}

		this.applyFilter({ qb: qbId, filter: query });

		const [rawTracks, totalItems] = await Promise.all([
			qbId.getMany(),
			qbId.getCount(),
		]);

		const trackIds = rawTracks.map((t) => t.id);

		if (trackIds.length === 0) return [[] as Track[], 0];

		// BƯỚC 2: LOAD CHI TIẾT TỪ ID ĐÃ LỌC
		const qbDetail = this.createBaseQb();
		qbDetail.where('track.id IN (:...trackIds)', { trackIds });

		this.leftJoinRelation(qbDetail);

		this.addSelectReleaseSimple(qbDetail);
		this.addSelectReleaseCoverArtSimple(qbDetail);
		this.addSelectLabel(qbDetail);
		this.addSelectAudioFile(qbDetail);
		this.addSelectFileAndPeak(qbDetail);
		this.addSelectTrackArtist(qbDetail);
		this.addSelectTrackContributor(qbDetail);
		this.addSelectTrackLanguage(qbDetail);
		this.addSelectMetadataLanguage(qbDetail);
		this.addSelectAudioLanguage(qbDetail);
		this.addSelectMetadataLanguageCountry(qbDetail);
		this.addSelectRecordingCountry(qbDetail);
		this.addSelectPrimaryGenre(qbDetail);
		this.addSelectSubGenre(qbDetail);
		this.addSelectTrackType(qbDetail);
		this.addSelectTrackOriginType(qbDetail);
		this.addSelectTrackSensitive(qbDetail);

		const itemsDb = await qbDetail.getMany();

		const itemsMap = new Map(itemsDb.map((item) => [item.id, item]));
		const items = trackIds
			.map((id) => itemsMap.get(id))
			.filter(Boolean) as Track[];

		return [items, totalItems];
	}

	async getListSimple(query: QueryGetListTrackDto) {
		const { idInclude, page, pageSize, keyword, isImportedFromReport } =
			query;

		const trackInclude = idInclude?.length
			? await this.trackRepo.find({
					select: { id: true, title: true },
					where: { id: In(idInclude) },
				})
			: [];

		const [items, totalItems] = await this.trackRepo.findAndCount({
			select: { id: true, title: true },
			where: {
				...(keyword && keyword.length > 0 && keyword[0]
					? { title: ILike(`%${keyword[0]}%`) }
					: {}),
				...(isImportedFromReport !== undefined
					? { isImportedFromReport }
					: {}),
				...(idInclude?.length ? { id: Not(In(idInclude)) } : {}),
			},
			order: { title: 'ASC' },
			skip: (page - 1) * pageSize,
			take: pageSize,
		});

		return { items: [...trackInclude, ...items], totalItems };
	}

	async getListWithPolicy(query: QueryGetListTrackDto) {
		const qb = this.createQueryGetListWithPolicy(query);
		return await qb.getManyAndCount();
	}

	async getListWithRevenue(query: QueryGetListTrackDto) {
		const qb = this.createQueryGetListWithRevenue(query);
		return await qb.getManyAndCount();
	}

	async findOne(id: string): Promise<Track> {
		const track = await this.trackRepo.findOne({
			where: { id },
		});

		if (!track) {
			throw new ResponseError(TrackMessages.NOT_FOUND);
		}

		return track;
	}

	async getDetailOne(id: string): Promise<Track> {
		const qb = this.createBaseQb();

		qb.where('track.id = :id', {
			id,
		});

		this.leftJoinRelation(qb);

		// select
		this.addSelectReleaseSimple(qb);
		this.addSelectReleaseCoverArtSimple(qb);
		this.addSelectLabel(qb);
		this.addSelectAudioFile(qb);
		this.addSelectFileAndPeak(qb);

		this.addSelectTrackArtist(qb);
		this.addSelectTrackContributor(qb);

		this.addSelectTrackLanguage(qb);
		this.addSelectMetadataLanguage(qb);
		this.addSelectMetadataLanguageCountry(qb);
		this.addSelectRecordingCountry(qb);
		this.addSelectAudioLanguage(qb);

		qb.addOrderBy('trackArtist.createdAt', 'ASC');
		qb.addOrderBy('trackContributor.createdAt', 'ASC');
		qb.addOrderBy('artistProfileDsp.name', 'ASC');
		qb.addOrderBy('artistContributorProfileDsp.name', 'ASC');

		const track = await qb.getOne();

		if (!track) {
			throw new ResponseError(TrackMessages.NOT_FOUND);
		}

		return track;
	}

	async getDetailMetadataOne(id: string): Promise<Track> {
		const query = this.trackRepo.createQueryBuilder('track');

		query.where('track.id = :id', {
			id,
		});

		query
			.leftJoin('track.primaryGenre', 'primaryGenre')
			.leftJoin('track.subGenre', 'subGenre')

			.leftJoin('track.trackArtists', 'trackArtist')
			// .leftJoin('trackArtist.artistRole', 'artistRole')
			.leftJoin('trackArtist.artist', 'artist')

			.leftJoin('track.trackLanguage', 'trackLanguage')
			.leftJoin(
				'trackLanguage.metadataLanguageCountry',
				'metadataLanguageCountry',
			)
			.leftJoin('trackLanguage.recordingCountry', 'recordingCountry')
			.leftJoin('trackLanguage.audioLanguage', 'audioLanguage')
			.leftJoin('trackLanguage.metadataLanguage', 'metadataLanguage')

			.leftJoin('track.trackLocalizes', 'trackLocalize')

			.leftJoin('track.trackType', 'trackType')
			.leftJoin('track.trackOriginType', 'trackOriginType');

		// select
		query.select([
			'track.title',
			'track.version',
			'track.isrc',
			'track.isSensitiveContent',
			'track.pLineYear',
			'track.pLineOwner',
		]);

		query
			.addSelect(['trackArtist.id'])
			// .addSelect(['artistRole.name'])
			.addSelect(['artist.name', 'artist.picture']);

		query.addSelect([
			'primaryGenre.name',
			'primaryGenre.value',
			'primaryGenre.picture',
		]);

		query.addSelect([
			'subGenre.name',
			'subGenre.value',
			'subGenre.picture',
		]);

		query
			.addSelect(['trackLanguage.id'])
			.addSelect(['metadataLanguageCountry.name'])
			.addSelect(['recordingCountry.name'])
			.addSelect(['audioLanguage.name'])
			.addSelect(['metadataLanguage.name']);

		query.addSelect(['trackType.name']);
		query.addSelect(['trackOriginType.name']);

		const track = await query.getOne();

		if (!track) {
			throw new ResponseError(TrackMessages.NOT_FOUND);
		}

		return track;
	}

	async getDetailAudioFileOne(id: string): Promise<Track> {
		const query = this.trackRepo.createQueryBuilder('track');

		query.where('track.id = :id', {
			id,
		});

		query
			.leftJoin('track.audioFile', 'audioFile')
			.leftJoin('audioFile.file', 'file')
			.leftJoin('audioFile.peak', 'peak');

		query.select(['track.title']);

		query.addSelect([
			'audioFile.bitrate',
			'audioFile.bitDepth',
			'audioFile.sampleRate',
			'audioFile.fileId',
			'audioFile.peakId',
		]);

		query.addSelect(['file.id', 'peak.id']);

		const track = await query.getOne();

		if (!track) {
			throw new ResponseError(TrackMessages.NOT_FOUND);
		}

		return track;
	}

	async getTracksOfRelease({ releaseId }: { releaseId: string }) {
		return this.trackRepo.find({ where: { releaseId } });
	}

	async validateForeignKey({
		releaseId,
		primaryGenreId,
		subGenreId,
		trackOriginTypeId,
		trackTypeId,
		priceTierId,
		trackSensitiveId,
	}: {
		primaryGenreId?: string | null;
		subGenreId?: string | null;
		releaseId?: string | null;
		trackTypeId?: string | null;
		trackOriginTypeId?: string | null;
		priceTierId?: string | null;
		trackSensitiveId?: string;
	}) {
		if (releaseId) {
			const release = await this.releaseRepo.findOne({
				where: { id: releaseId },
			});

			if (!release) {
				throw new ResponseError(TrackMessages.RELEASE_NOT_FOUND);
			}
		}
		if (primaryGenreId) {
			const genre = await this.genreRepo.findOne({
				where: { id: primaryGenreId },
			});

			if (!genre) {
				throw new ResponseError(TrackMessages.PRIMARY_GENRE_NOT_FOUND);
			}
		}

		if (subGenreId) {
			const genre = await this.genreRepo.findOne({
				where: { id: subGenreId },
			});

			if (!genre) {
				throw new ResponseError(TrackMessages.SUB_GENRE_NOT_FOUND);
			}
		}

		if (trackTypeId) {
			const trackType = await this.trackTypeRepo.findOne({
				where: { id: trackTypeId },
			});

			if (!trackType) {
				throw new ResponseError(TrackMessages.TRACK_TYPE_NOT_FOUND);
			}
		}

		if (trackOriginTypeId) {
			const trackOriginType = await this.trackOriginTypeRepo.findOne({
				where: { id: trackOriginTypeId },
			});

			if (!trackOriginType) {
				throw new ResponseError(
					TrackMessages.TRACK_ORIGIN_TYPE_NOT_FOUND,
				);
			}
		}

		if (priceTierId) {
			const priceTier = await this.priceTierRepo.findOne({
				where: { id: priceTierId },
			});

			if (!priceTier) {
				throw new ResponseError(TrackMessages.PRICE_TIER_NOT_FOUND);
			}
		}

		if (trackSensitiveId) {
			const entity = await this.trackSensitiveRepo.findOne({
				where: { id: trackSensitiveId },
			});

			if (!entity) {
				throw new ResponseError(
					TrackMessages.TRACK_SENSITIVE_NOT_FOUND,
				);
			}
		}
	}

	ensureNonDraftTrack(track: ITrack): ITrackNonDraft {
		// if (track.status === TrackStatus.DRAFT) {
		// 	throw new ResponseError({ message: 'Invalid track.status' });
		// }

		if (!track.primaryGenreId) {
			throw new ResponseError({
				message: 'Invalid track.primaryGenreId',
			});
		}

		if (!track.pLineOwner) {
			throw new ResponseError({
				message: 'Invalid track.pLineOwner',
			});
		}

		return track as ITrackNonDraft;
	}

	ensureDraftTrack(track: ITrack): ITrackDraft {
		// if (track.status !== TrackStatus.DRAFT) {
		// 	throw new ResponseError({
		// 		message: 'Invalid track.status',
		// 	});
		// }

		return track;
	}

	async validateDataUpdate({
		trackDb,
		dataUpdate,
	}: {
		trackDb: Track;
		dataUpdate: UpdateTrackDraftDto;
	}) {
		const {
			primaryGenreId,
			subGenreId,
			trackOriginTypeId,
			trackTypeId,
			priceTierId,
			trackSensitiveId,
		} = dataUpdate;

		if (primaryGenreId && primaryGenreId !== trackDb.primaryGenreId) {
			await this.validateForeignKey({
				primaryGenreId,
			});
		}

		if (subGenreId && subGenreId !== trackDb.subGenreId) {
			await this.validateForeignKey({
				subGenreId,
			});
		}

		if (
			trackOriginTypeId &&
			trackOriginTypeId !== trackDb.trackOriginTypeId
		) {
			await this.validateForeignKey({
				trackOriginTypeId,
			});
		}

		if (trackTypeId && trackTypeId !== trackDb.trackTypeId) {
			await this.validateForeignKey({
				trackTypeId,
			});
		}

		if (priceTierId && priceTierId !== trackDb.priceTierId) {
			await this.validateForeignKey({
				priceTierId,
			});

			const priceTier = await this.priceTierRepo.findOneOrFail({
				where: { id: priceTierId },
			});

			if (priceTier.type !== PriceTierType.TRACK) {
				throw new ResponseError({
					message: 'Invalid priceTier.type',
				});
			}
		}

		if (trackSensitiveId && trackSensitiveId !== trackDb.trackSensitiveId) {
			await this.validateForeignKey({
				trackSensitiveId,
			});
		}
	}

	// query
	async getRelease({
		releaseId,
	}: {
		releaseId: string;
	}): Promise<Release | null> {
		const release = await this.releaseRepo.findOne({
			where: { id: releaseId },
			relations: {
				releaseLanguage: true,
			},
		});

		return release;
	}

	// kéo data từ release sang tracks
	async enrichTrackDraftWithReleaseData({
		trackDrafts,
		releaseId,
	}: {
		trackDrafts: BulkCreateTrackDraft['trackDrafts'];
		releaseId: string;
	}) {
		const [
			release,
			priceTierDefault,
			trackTypeDefault,
			trackOriginTypeDefault,
		] = await Promise.all([
			this.getRelease({
				releaseId,
			}),

			this.priceTierRepo.findOne({
				where: { isDefault: true, isActive: true },
			}),

			this.trackTypeRepo.findOne({
				where: { isDefault: true },
			}),

			this.trackOriginTypeRepo.findOne({
				where: { isDefault: true },
			}),
		]);

		const result = trackDrafts.map((track) =>
			this.enrichSingleTrackDraft({
				track,
				release,
				priceTierId: priceTierDefault?.id ?? null,
				trackTypeId: trackTypeDefault?.id ?? null,
				trackOriginTypeId: trackOriginTypeDefault?.id ?? null,
			}),
		);

		return result;
	}

	// private
	private createQueryGetList(filter: QueryGetListTrackDto) {
		const qb = this.createBaseQb();

		this.leftJoinRelation(qb);

		this.applyFilter({ qb, filter });

		this.addSelectReleaseSimple(qb);
		this.addSelectReleaseCoverArtSimple(qb);
		this.addSelectLabel(qb);
		this.addSelectAudioFile(qb);
		this.addSelectFileAndPeak(qb);

		this.addSelectTrackArtist(qb);
		this.addSelectTrackContributor(qb);

		this.addSelectTrackLanguage(qb);
		this.addSelectMetadataLanguage(qb);
		this.addSelectAudioLanguage(qb);
		this.addSelectMetadataLanguageCountry(qb);
		this.addSelectRecordingCountry(qb);
		this.addSelectPrimaryGenre(qb);
		this.addSelectSubGenre(qb);
		this.addSelectTrackType(qb);
		this.addSelectTrackOriginType(qb);
		this.addSelectTrackSensitive(qb);

		return qb;
	}

	private createBaseQb() {
		return this.trackRepo.createQueryBuilder('track');
	}

	private leftJoinRelation(qb: SelectQueryBuilder<Track>) {
		qb.leftJoin('track.release', 'release')
			.leftJoin('release.releaseCoverArts', 'releaseCoverArt')

			.leftJoin('release.label', 'label')

			.leftJoin('track.audioFile', 'audioFile')
			.leftJoin('audioFile.file', 'file')
			.leftJoin('audioFile.peak', 'peak')

			// artist
			.leftJoin('track.trackArtists', 'trackArtist')
			// .leftJoin('trackArtist.artistRole', 'artistRole')
			.leftJoin('trackArtist.artist', 'artist')
			.leftJoinAndSelect('artist.artistProfiles', 'artistProfile')
			.leftJoinAndSelect('artistProfile.dsp', 'artistProfileDsp')
			.leftJoin('artist.genre', 'genre')
			.leftJoin('artist.country', 'country')

			// contributor
			.leftJoin('track.trackContributors', 'trackContributor')
			.leftJoin('trackContributor.artistRole', 'artistRoleContributor')
			.leftJoin('trackContributor.artist', 'artistContributor')
			.leftJoinAndSelect(
				'artistContributor.artistProfiles',
				'artistContributorProfile',
			)
			.leftJoinAndSelect(
				'artistContributorProfile.dsp',
				'artistContributorProfileDsp',
			)
			.leftJoin('artistContributor.country', 'countryContributor')
			.leftJoin('artistContributor.genre', 'artistContributorGenre')

			.leftJoin('track.trackLanguage', 'trackLanguage')
			.leftJoin(
				'trackLanguage.metadataLanguageCountry',
				'metadataLanguageCountry',
			)
			.leftJoin('trackLanguage.metadataLanguage', 'metadataLanguage')
			.leftJoin('trackLanguage.recordingCountry', 'recordingCountry')
			.leftJoin('trackLanguage.audioLanguage', 'audioLanguage')

			.leftJoin('track.primaryGenre', 'primaryGenre')
			.leftJoin('track.subGenre', 'subGenre')

			.leftJoin('track.trackType', 'trackType')
			.leftJoin('track.trackOriginType', 'trackOriginType')
			.leftJoin('track.trackSensitive', 'trackSensitive');
	}

	private applyFilter({
		qb,
		filter,
	}: {
		qb: SelectQueryBuilder<Track>;
		filter: QueryGetListTrackDto;
	}) {
		const {
			keyword,

			releaseId,
			tenantIds,

			artistId,
			labelId,
			scanCopyrightStatus,
			primaryGenreId,
			isImportedFromReport,

			startCreatedAt,
			endCreatedAt,
			startUpdatedAt,
			endUpdatedAt,
		} = filter;

		if (keyword && keyword.length) {
			keyword.forEach((kw, index) => {
				if (!kw) return;
				qb.andWhere(
					new Brackets((qbInner) => {
						qbInner
							.where(`track.title ILIKE :kw_${index}`)
							.orWhere(`track.lyric ILIKE :kw_${index}`)
							.orWhere(`track.version ILIKE :kw_${index}`)
							.orWhere(`track.isrc ILIKE :kw_${index}`);
					}),
					{ [`kw_${index}`]: `%${kw}%` },
				);
			});
		}

		if (releaseId?.length) {
			qb.andWhere('track.releaseId IN (:...releaseId)', {
				releaseId,
			});
		}

		if (tenantIds?.length) {
			qb.andWhere('release.tenantId IN (:...tenantIds)', {
				tenantIds,
			});
		}

		if (labelId?.length) {
			qb.andWhere('release.labelId IN (:...labelId)', {
				labelId,
			});
		}

		if (artistId?.length) {
			qb.andWhere('trackArtist.artistId IN (:...artistId)', {
				artistId,
			});
		}

		if (scanCopyrightStatus?.length) {
			qb.andWhere(
				'track.scanCopyrightStatus IN (:...scanCopyrightStatus)',
				{
					scanCopyrightStatus,
				},
			);
		}

		if (primaryGenreId?.length) {
			qb.andWhere('track.primaryGenreId IN (:...primaryGenreId)', {
				primaryGenreId,
			});
		}

		if (isImportedFromReport !== undefined) {
			qb.andWhere('track.isImportedFromReport = :isImportedFromReport', {
				isImportedFromReport,
			});
		}

		if (startCreatedAt && endCreatedAt) {
			qb.andWhere(
				`track.createdAt BETWEEN :startCreatedAt AND :endCreatedAt`,
				{
					startCreatedAt,
					endCreatedAt,
				},
			);
		}

		if (startUpdatedAt && endUpdatedAt) {
			qb.andWhere(
				`track.updatedAt BETWEEN :startUpdatedAt AND :endUpdatedAt`,
				{
					startUpdatedAt,
					endUpdatedAt,
				},
			);
		}

		orderAndPaging2({ qb, filter });

		return qb;
	}

	private leftJoinTrackPolicy(qb: SelectQueryBuilder<Track>) {
		qb.leftJoin('track.priceTier', 'priceTier')
			.leftJoin('priceTier.currency', 'currency')

			.leftJoin('track.trackPolicies', 'trackPolicy')
			.leftJoin('trackPolicy.dsp', 'dsp')
			.leftJoin('trackPolicy.action', 'action');
	}

	private leftJoinTrackRevenue(qb: SelectQueryBuilder<Track>) {
		qb.leftJoin('track.trackRevenues', 'trackRevenue')
			.leftJoin('track.primaryGenre', 'primaryGenre')

			.leftJoin('track.trackArtists', 'trackArtist')
			// .leftJoin('trackArtist.artistRole', 'artistRole')
			.leftJoin('trackArtist.artist', 'artist')

			.leftJoin('trackRevenue.dsp', 'dsp')
			.leftJoin('track.release', 'release')
			.leftJoin('release.label', 'label');
	}

	private addSelectTrackPolicy(qb: SelectQueryBuilder<Track>) {
		qb.select([
			'track.id',
			'track.title',
			'track.releaseId',
			'track.createdAt',
			'track.order',
		])
			.addSelect(['priceTier.id', 'priceTier.amount'])
			.addSelect(['currency.id', 'currency.name', 'currency.code'])

			.addSelect([
				'trackPolicy.id',
				'trackPolicy.actionId',
				'trackPolicy.dspId',
			])
			.addSelect(['dsp.id', 'dsp.name', 'dsp.picture'])
			.addSelect([
				'action.id',
				'action.code',
				'action.name',
				'action.note',
			]);
	}

	private selectTrackSimple(qb: SelectQueryBuilder<Track>) {
		return qb.select([
			'track.id',
			'track.title',
			'track.releaseId',
			'track.createdAt',
			'track.order',
		]);
	}

	private addSelectTrackRevenue(qb: SelectQueryBuilder<Track>) {
		this.selectTrackSimple(qb);
		this.addSelectLabel(qb);
		this.addSelectReleaseSimple(qb);
		this.addSelectTrackArtist(qb);
		this.addSelectPrimaryGenre(qb);
		this.addSelectTrackRevenueMore(qb);
	}

	private addSelectTrackRevenueMore(qb: SelectQueryBuilder<Track>) {
		return qb.addSelect([
			'trackRevenue.countryCode',
			'trackRevenue.configuration',
			'trackRevenue.countryCode',
		]);
	}

	private createQueryGetListWithPolicy(filter: QueryGetListTrackDto) {
		const qb = this.createBaseQb();
		this.addSelectTrackPolicy(qb);
		this.leftJoinTrackPolicy(qb);
		this.applyFilter({ qb, filter });

		return qb;
	}

	private createQueryGetListWithRevenue(filter: QueryGetListTrackDto) {
		const qb = this.createBaseQb();
		this.addSelectTrackRevenue(qb);
		this.leftJoinTrackRevenue(qb);
		this.applyFilter({ qb, filter });

		return qb;
	}

	private addSelectReleaseSimple(qb: SelectQueryBuilder<Track>) {
		return qb.addSelect([
			'release.id',
			'release.title',
			'release.labelId',
			'release.tenantId',
		]);
	}

	private addSelectReleaseCoverArtSimple(qb: SelectQueryBuilder<Track>) {
		return qb.addSelect([
			'releaseCoverArt.id',
			'releaseCoverArt.fileId',
			'releaseCoverArt.type',
		]);
	}

	private addSelectLabel(qb: SelectQueryBuilder<Track>) {
		return qb.addSelect([
			'label.id',
			'label.name',
			'label.picture',
			'label.description',
		]);
	}

	private addSelectAudioFile(qb: SelectQueryBuilder<Track>) {
		return qb.addSelect([
			'audioFile.id',
			'audioFile.sampleRate',
			'audioFile.bitrate',
			'audioFile.bitDepth',
			'audioFile.duration',
			'audioFile.sampleLength',
			'audioFile.preview',
			'audioFile.fileId',
			'audioFile.peakId',
		]);
	}

	private addSelectFileAndPeak(qb: SelectQueryBuilder<Track>) {
		return qb
			.addSelect(['file.id', 'file.fileName', 'file.fileSize'])
			.addSelect(['peak.id']);
	}

	private addSelectTrackArtist(qb: SelectQueryBuilder<Track>) {
		return (
			qb
				.addSelect([
					'trackArtist.id',
					'trackArtist.artistId',
					'trackArtist.createdAt',
					// 'trackArtist.artistRoleId',
				])

				// role
				// .addSelect(['artistRole.id', 'artistRole.name', 'artistRole.code'])

				// artist
				.addSelect([
					'artist.id',
					'artist.name',
					'artist.picture',
					'artist.genreId',
					'artist.countryId',
				])

				// genre
				.addSelect(['genre.id', 'genre.name', 'genre.picture'])

				// country
				.addSelect([
					'country.id',
					'country.name',
					'country.iso3',
					'country.iso2',
				])
		);
	}

	private addSelectTrackContributor(qb: SelectQueryBuilder<Track>) {
		return (
			qb
				.addSelect([
					'trackContributor.id',
					'trackContributor.artistId',
					'trackContributor.artistRoleId',
					'trackContributor.createdAt',
				])

				// role
				.addSelect([
					'artistRoleContributor.id',
					'artistRoleContributor.name',
					'artistRoleContributor.code',
				])

				// artist
				.addSelect([
					'artistContributor.id',
					'artistContributor.name',
					'artistContributor.picture',
					'artistContributor.countryId',
					'artistContributor.genreId',
				])

				// genre
				.addSelect([
					'artistContributorGenre.id',
					'artistContributorGenre.name',
					'artistContributorGenre.picture',
				])

				// country
				.addSelect([
					'countryContributor.id',
					'countryContributor.name',
					'countryContributor.iso2',
				])
		);
	}

	private addSelectTrackLanguage(qb: SelectQueryBuilder<Track>) {
		return qb.addSelect([
			'trackLanguage.id',
			'trackLanguage.metadataLanguageCountryId',
			'trackLanguage.audioLanguageId',
			'trackLanguage.metadataLanguageId',
			'trackLanguage.recordingCountryId',
		]);
	}

	private addSelectMetadataLanguage(qb: SelectQueryBuilder<Track>) {
		return qb.addSelect([
			'metadataLanguage.id',
			'metadataLanguage.name',
			'metadataLanguage.code',
		]);
	}

	private addSelectAudioLanguage(qb: SelectQueryBuilder<Track>) {
		return qb.addSelect([
			'audioLanguage.id',
			'audioLanguage.name',
			'audioLanguage.code',
		]);
	}

	private addSelectMetadataLanguageCountry(qb: SelectQueryBuilder<Track>) {
		return qb.addSelect([
			'metadataLanguageCountry.id',
			'metadataLanguageCountry.name',
			'metadataLanguageCountry.iso3',
			'metadataLanguageCountry.iso2',
			'metadataLanguageCountry.numericCode',
			'metadataLanguageCountry.phoneCode',
			'metadataLanguageCountry.capital',
			'metadataLanguageCountry.currency',
			'metadataLanguageCountry.currencyName',
			'metadataLanguageCountry.currencySymbol',
			'metadataLanguageCountry.regionId',
			'metadataLanguageCountry.nationality',
			'metadataLanguageCountry.continent',
		]);
	}

	private addSelectRecordingCountry(qb: SelectQueryBuilder<Track>) {
		return qb.addSelect([
			'recordingCountry.id',
			'recordingCountry.name',
			'recordingCountry.iso3',
			'recordingCountry.iso2',
			'recordingCountry.numericCode',
			'recordingCountry.phoneCode',
			'recordingCountry.capital',
			'recordingCountry.currency',
			'recordingCountry.currencyName',
			'recordingCountry.currencySymbol',
			'recordingCountry.regionId',
			'recordingCountry.nationality',
			'recordingCountry.continent',
		]);
	}

	private addSelectPrimaryGenre(qb: SelectQueryBuilder<Track>) {
		return qb.addSelect([
			'primaryGenre.id',
			'primaryGenre.name',
			'primaryGenre.code',
			'primaryGenre.picture',
			'primaryGenre.description',
		]);
	}

	private addSelectSubGenre(qb: SelectQueryBuilder<Track>) {
		return qb.addSelect([
			'subGenre.id',
			'subGenre.name',
			'subGenre.code',
			'subGenre.picture',
			'subGenre.description',
		]);
	}

	private addSelectTrackType(qb: SelectQueryBuilder<Track>) {
		return qb.addSelect([
			'trackType.id',
			'trackType.name',
			'trackType.code',
		]);
	}

	private addSelectTrackOriginType(qb: SelectQueryBuilder<Track>) {
		return qb.addSelect([
			'trackOriginType.id',
			'trackOriginType.name',
			'trackOriginType.code',
		]);
	}

	private addSelectTrackSensitive(qb: SelectQueryBuilder<Track>) {
		return qb.addSelect([
			'trackSensitive.id',
			'trackSensitive.name',
			'trackSensitive.code',
			'trackSensitive.icon',
		]);
	}

	private enrichSingleTrackDraft({
		track,
		release,
		priceTierId,
		trackTypeId,
		trackOriginTypeId,
	}: {
		track: BulkCreateTrackDraft['trackDrafts'][number];
		release: Release | null;
		priceTierId: string | null;
		trackTypeId: string | null;
		trackOriginTypeId: string | null;
	}): IHandleCreateTrackOne {
		return {
			...track,

			isInstrumental:
				track.isInstrumental ?? release?.isInstrumental ?? false,

			pLineYear: release?.pLineYear,
			pLineOwner: release?.pLineOwner,

			primaryGenreId: release?.primaryGenreId,
			subGenreId: release?.subGenreId,
			version: release?.version,

			priceTierId,
			trackTypeId,
			trackOriginTypeId,

			trackLanguage: this.populateTrackLanguage(release),
			audioFileDraft: this.setAudioPreviewAndSampleLength(
				track.audioFileDraft,
			),
		};
	}

	private setAudioPreviewAndSampleLength(
		audioFileDraft: BulkCreateTrackDraft['trackDrafts'][number]['audioFileDraft'],
	) {
		const { duration } = audioFileDraft;
		const { sampleLength, preview } =
			this.calculatePreviewAndSampleLength(duration);

		return {
			...audioFileDraft,
			sampleLength,
			preview,
		};
	}

	private calculatePreviewAndSampleLength(duration: number) {
		const { sampleLength: sampleConfig, preview: previewConfig } =
			this.appConfigService.cache.config.general;
		const preview =
			duration > previewConfig ? previewConfig : Math.round(duration / 2);
		const sampleLength =
			preview + sampleConfig < duration
				? sampleConfig
				: duration - preview;
		return { preview, sampleLength };
	}

	private populateTrackLanguage(release: Release | null) {
		if (!release?.releaseLanguage) return undefined;
		const { id: _id, ...rest } = release.releaseLanguage;

		return {
			...rest,
			recordingCountryId: rest.metadataLanguageCountryId,
		};
	}
}
