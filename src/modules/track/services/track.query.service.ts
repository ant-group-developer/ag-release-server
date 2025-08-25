import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { Genre } from 'src/modules/genre/entities/genre.entity';
import { PriceTier } from 'src/modules/price-tiers/entities/price-tier.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { TrackOriginType } from 'src/modules/track-origin-type/entities/track-origin-type.entity';
import { TrackType } from 'src/modules/track-type/entities/track-type.entity';
import { Brackets, Repository } from 'typeorm';
import {
	TrackMessageCodeError,
	TrackMessageError,
} from '../constants/track.constant';
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
	) {}

	// private
	private baseQueryGetList(query: QueryGetListTrackDto) {
		const {
			keyword,

			releaseId,

			artistId,
			labelId,
			scanCopyrightStatus,
			primaryGenreId,

			startCreatedAt,
			endCreatedAt,
			startUpdatedAt,
			endUpdatedAt,

			fieldOrder,
			orderBy,

			skip,
			pageSize,
		} = query;

		const queryBuilder = this.trackRepo.createQueryBuilder('track');

		// join for filter
		queryBuilder
			.leftJoin('track.release', 'release')
			.leftJoin('track.trackArtists', 'trackArtist');

		if (keyword) {
			queryBuilder.andWhere(
				new Brackets((qb) => {
					qb.where('track.title ILIKE :keyword')
						.orWhere('track.lyric ILIKE :keyword')
						.orWhere('track.version ILIKE :keyword');
				}),
				{ keyword: `%${keyword}%` },
			);
		}

		if (releaseId?.length) {
			queryBuilder.andWhere('track.releaseId IN (:...releaseId)', {
				releaseId,
			});
		}

		if (labelId?.length) {
			queryBuilder.andWhere('release.labelId IN (:...labelId)', {
				labelId,
			});
		}

		if (artistId?.length) {
			queryBuilder.andWhere('trackArtist.artistId IN (:...artistId)', {
				artistId,
			});
		}

		if (scanCopyrightStatus?.length) {
			queryBuilder.andWhere(
				'track.scanCopyrightStatus IN (:...scanCopyrightStatus)',
				{
					scanCopyrightStatus,
				},
			);
		}

		if (primaryGenreId?.length) {
			queryBuilder.andWhere(
				'track.primaryGenreId IN (:...primaryGenreId)',
				{
					primaryGenreId,
				},
			);
		}

		if (startCreatedAt && endCreatedAt) {
			queryBuilder.andWhere(
				`track.createdAt BETWEEN :startCreatedAt AND :endCreatedAt`,
				{
					startCreatedAt,
					endCreatedAt,
				},
			);
		}

		if (startUpdatedAt && endUpdatedAt) {
			queryBuilder.andWhere(
				`track.updatedAt BETWEEN :startUpdatedAt AND :endUpdatedAt`,
				{
					startUpdatedAt,
					endUpdatedAt,
				},
			);
		}

		queryBuilder.orderBy(`track.${fieldOrder}`, orderBy);
		queryBuilder.skip(skip).take(pageSize);

		return queryBuilder;
	}

	private createQueryGetListWithPolicy(query: QueryGetListTrackDto) {
		const queryGetList = this.baseQueryGetList(query);

		const qb = queryGetList.clone();
		qb.leftJoin('track.priceTier', 'priceTier')
			.leftJoin('priceTier.currency', 'currency')

			.leftJoin('track.trackPolicies', 'trackPolicy')
			.leftJoin('trackPolicy.dsp', 'dsp')
			.leftJoin('trackPolicy.action', 'action')

			.select([
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

		return qb;
	}

	// public
	async getList(query: QueryGetListTrackDto) {
		const queryGetList = this.baseQueryGetList(query);

		queryGetList
			.leftJoin('release.releaseCoverArts', 'releaseCoverArt')

			.leftJoin('track.audioFile', 'audioFile')
			.leftJoin('audioFile.file', 'file')
			.leftJoin('audioFile.peak', 'peak')

			.leftJoin('trackArtist.artistRole', 'artistRole')
			.leftJoin('trackArtist.artist', 'artist')

			.leftJoin('track.trackLanguage', 'trackLanguage')
			.leftJoin(
				'trackLanguage.metadataLanguageCountry',
				'metadataLanguageCountry',
			)
			.leftJoin('trackLanguage.recordingCountry', 'recordingCountry')
			.leftJoin('trackLanguage.audioLanguage', 'audioLanguage')

			.leftJoinAndSelect('track.primaryGenre', 'primaryGenre')
			.leftJoinAndSelect('track.subGenre', 'subGenre')

			.leftJoinAndSelect('track.trackType', 'trackType')
			.leftJoinAndSelect('track.trackOriginType', 'trackOriginType');

		// select
		queryGetList
			.addSelect(['release.id', 'release.title', 'release.labelId'])
			.addSelect([
				'releaseCoverArt.id',
				'releaseCoverArt.fileId',
				'releaseCoverArt.type',
			])
			.addSelect([
				'audioFile.id',
				'audioFile.sampleRate',
				'audioFile.bitrate',
				'audioFile.bitDepth',
				'audioFile.duration',
				'audioFile.hook',
				'audioFile.preview',
				'audioFile.fileId',
				'audioFile.peakId',
			])

			.addSelect(['file.id', 'file.fileName'])
			.addSelect(['peak.id'])

			.addSelect([
				'trackArtist.id',
				'trackArtist.artistId',
				'trackArtist.artistRoleId',
			])

			.addSelect(['artistRole.id', 'artistRole.name', 'artistRole.code'])
			.addSelect(['artist.id', 'artist.name', 'artist.picture'])

			.addSelect(['trackLanguage.id'])
			.addSelect([
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
			])
			.addSelect([
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
			])
			.addSelect([
				'audioLanguage.id',
				'audioLanguage.name',
				'audioLanguage.code',
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

			.addSelect(['trackType.id', 'trackType.name', 'trackType.code'])
			.addSelect([
				'trackOriginType.id',
				'trackOriginType.name',
				'trackOriginType.code',
			]);

		return await queryGetList.getManyAndCount();
	}

	async getListWithPolicy(query: QueryGetListTrackDto) {
		const queryGetListWithPolicy = this.createQueryGetListWithPolicy(query);
		queryGetListWithPolicy.addOrderBy('dsp.name', 'ASC');

		return await queryGetListWithPolicy.getManyAndCount();
	}

	async findOne(id: string): Promise<Track> {
		const track = await this.trackRepo.findOne({
			where: { id },
		});

		if (!track) {
			throw new ResponseError({
				message: TrackMessageError.NOT_FOUND,
				statusCode: 404,
			});
		}

		return track;
	}

	async getDetailOne(id: string): Promise<Track> {
		const query = this.trackRepo.createQueryBuilder('track');

		query.where('track.id = :id', {
			id,
		});

		query
			.leftJoin('track.release', 'release')
			.leftJoin('release.releaseCoverArts', 'releaseCoverArt')
			.leftJoin('release.label', 'label')

			.leftJoinAndSelect('track.audioFile', 'audioFile')
			.leftJoinAndSelect('audioFile.file', 'file')
			.leftJoinAndSelect('audioFile.peak', 'peak')

			.leftJoinAndSelect('track.trackArtists', 'trackArtist')
			.leftJoinAndSelect('trackArtist.artistRole', 'artistRole')
			.leftJoinAndSelect('trackArtist.artist', 'artist')

			.leftJoinAndSelect('track.trackLanguage', 'trackLanguage')
			.leftJoinAndSelect(
				'trackLanguage.metadataLanguageCountry',
				'metadataLanguageCountry',
			)
			.leftJoinAndSelect(
				'trackLanguage.recordingCountry',
				'recordingCountry',
			)
			.leftJoinAndSelect('trackLanguage.audioLanguage', 'audioLanguage')
			.leftJoinAndSelect(
				'trackLanguage.metadataLanguage',
				'metadataLanguage',
			);

		// select
		query
			.addSelect(['release.id', 'release.title'])
			.addSelect([
				'releaseCoverArt.id',
				'releaseCoverArt.fileId',
				'releaseCoverArt.type',
			])
			.addSelect([
				'label.id',
				'label.name',
				'label.picture',
				'label.description',
			]);

		const track = await query.getOne();

		if (!track) {
			throw new ResponseError({
				message: TrackMessageError.NOT_FOUND,
				statusCode: 404,
			});
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
			.leftJoin('trackArtist.artistRole', 'artistRole')
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
			.addSelect(['artistRole.name'])
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
			throw new ResponseError({
				message: TrackMessageError.NOT_FOUND,
				statusCode: 404,
			});
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
			throw new ResponseError({
				message: TrackMessageError.NOT_FOUND,
				statusCode: 404,
			});
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
	}: {
		primaryGenreId?: string | null;
		subGenreId?: string | null;
		releaseId?: string | null;
		trackTypeId?: string | null;
		trackOriginTypeId?: string | null;
		priceTierId?: string | null;
	}) {
		if (releaseId) {
			const release = await this.releaseRepo.findOne({
				where: { id: releaseId },
			});

			if (!release) {
				throw new ResponseError({
					message: TrackMessageError.RELEASE_NOT_FOUND,
					messageCode: TrackMessageCodeError.RELEASE_NOT_FOUND,
				});
			}
		}
		if (primaryGenreId) {
			const genre = await this.genreRepo.findOne({
				where: { id: primaryGenreId },
			});

			if (!genre) {
				throw new ResponseError({
					message: TrackMessageError.PRIMARY_GENRE_NOT_FOUND,
					messageCode: TrackMessageCodeError.PRIMARY_GENRE_NOT_FOUND,
				});
			}
		}

		if (subGenreId) {
			const genre = await this.genreRepo.findOne({
				where: { id: subGenreId },
			});

			if (!genre) {
				throw new ResponseError({
					message: TrackMessageError.SUB_GENRE_NOT_FOUND,
					messageCode: TrackMessageCodeError.SUB_GENRE_NOT_FOUND,
				});
			}
		}

		if (trackTypeId) {
			const trackType = await this.trackTypeRepo.findOne({
				where: { id: trackTypeId },
			});

			if (!trackType) {
				throw new ResponseError({
					message: TrackMessageError.TRACK_TYPE_NOT_FOUND,
					messageCode: TrackMessageCodeError.TRACK_TYPE_NOT_FOUND,
				});
			}
		}

		if (trackOriginTypeId) {
			const trackOriginType = await this.trackOriginTypeRepo.findOne({
				where: { id: trackOriginTypeId },
			});

			if (!trackOriginType) {
				throw new ResponseError({
					message: TrackMessageError.TRACK_ORIGIN_TYPE_NOT_FOUND,
					messageCode:
						TrackMessageCodeError.TRACK_ORIGIN_TYPE_NOT_FOUND,
				});
			}
		}

		if (priceTierId) {
			const priceTier = await this.priceTierRepo.findOne({
				where: { id: priceTierId },
			});

			if (!priceTier) {
				throw new ResponseError({
					message: TrackMessageError.PRICE_TIER_NOT_FOUND,
					messageCode: TrackMessageCodeError.PRICE_TIER_NOT_FOUND,
				});
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

		return track as ITrackDraft;
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

	//
	async fillDataToTracks({
		trackDrafts,
		releaseId,
	}: {
		trackDrafts: BulkCreateTrackDraft['trackDrafts'];
		releaseId: string;
	}) {
		const [release, priceTierDefault] = await Promise.all([
			this.getRelease({
				releaseId,
			}),
			this.priceTierRepo.findOne({
				where: { isDefault: true, isActive: true },
			}),
		]);

		return trackDrafts.map((track) =>
			this.fillDataToTrack({
				track,
				release,
				priceTierId: priceTierDefault?.id ?? null,
			}),
		);
	}

	private fillDataToTrack({
		track,
		release,
		priceTierId,
	}: {
		track: BulkCreateTrackDraft['trackDrafts'][number];
		release: Release | null;
		priceTierId: string | null;
	}): IHandleCreateTrackOne {
		const trackLanguage = release?.releaseLanguage
			? (({ id: _id, ...restOfReleaseLanguage }) => {
					return {
						...restOfReleaseLanguage,
						recordingCountryId:
							restOfReleaseLanguage.metadataLanguageCountryId,
					};
				})(release.releaseLanguage)
			: undefined;

		return {
			...track,

			pLineYear: release?.pLineYear,
			pLineOwner: release?.pLineOwner,

			primaryGenreId: release?.primaryGenreId,
			subGenreId: release?.subGenreId,
			version: release?.version,

			priceTierId,

			trackLanguage,
		};
	}
}
