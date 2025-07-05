import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { Genre } from 'src/modules/genre/entities/genre.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Repository } from 'typeorm';
import {
	TrackMessageCodeError,
	TrackMessageError,
} from '../constants/track.constant';
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
	) {}

	async validate({
		releaseId,
		primaryGenreId,
		subGenreId,
	}: {
		primaryGenreId?: string | null;
		subGenreId?: string | null;
		releaseId?: string | null;
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
}
