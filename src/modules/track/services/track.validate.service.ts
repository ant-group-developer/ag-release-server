import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { Genre } from 'src/modules/genre/entities/genre.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { TrackOriginType } from 'src/modules/track-origin-type/entities/track-origin-type.entity';
import { TrackType } from 'src/modules/track-type/entities/track-type.entity';
import { Repository } from 'typeorm';
import {
	TrackMessageCodeError,
	TrackMessageError,
} from '../constants/track.constant';
import { UpdateTrackDraftDto } from '../dto/track.draft.dto';
import { Track } from '../entities/track.entity';
import {
	ITrack,
	ITrackDraft,
	ITrackNonDraft,
} from '../interfaces/track.interface';

@Injectable()
export class TrackValidateService {
	constructor(
		@InjectRepository(Genre)
		private readonly genreRepo: Repository<Genre>,

		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,

		@InjectRepository(TrackType)
		private readonly trackTypeRepo: Repository<TrackType>,

		@InjectRepository(TrackOriginType)
		private readonly trackOriginTypeRepo: Repository<TrackOriginType>,
	) {}

	async validate({
		releaseId,
		primaryGenreId,
		subGenreId,
		trackOriginTypeId,
		trackTypeId,
	}: {
		primaryGenreId?: string | null;
		subGenreId?: string | null;
		releaseId?: string | null;
		trackTypeId?: string | null;
		trackOriginTypeId?: string | null;
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

	async handleValidateDataUpdate({
		trackDb,
		dataUpdate,
	}: {
		trackDb: Track;
		dataUpdate: UpdateTrackDraftDto;
	}) {
		const { primaryGenreId, subGenreId, trackOriginTypeId, trackTypeId } =
			dataUpdate;

		if (primaryGenreId && primaryGenreId !== trackDb.primaryGenreId) {
			await this.validate({
				primaryGenreId,
			});
		}

		if (subGenreId && subGenreId !== trackDb.subGenreId) {
			await this.validate({
				subGenreId,
			});
		}

		if (
			trackOriginTypeId &&
			trackOriginTypeId !== trackDb.trackOriginTypeId
		) {
			await this.validate({
				trackOriginTypeId,
			});
		}

		if (trackTypeId && trackTypeId !== trackDb.trackTypeId) {
			await this.validate({
				trackTypeId,
			});
		}
	}
}
