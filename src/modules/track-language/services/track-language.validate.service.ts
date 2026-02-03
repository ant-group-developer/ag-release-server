import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/common.response.dto';
import { Country } from 'src/modules/country/entities/country.entity';
import { Language } from 'src/modules/language/entities/language.entity';
import { Track } from 'src/modules/track/entities/track.entity';
import { Repository } from 'typeorm';
import { TrackLanguage } from '../entities/track-language.entity';
import {
	ITrackLanguage,
	ITrackLanguageDraft,
} from '../interfaces/track-language.interface';

@Injectable()
export class TrackLanguageValidateService {
	constructor(
		@InjectRepository(TrackLanguage)
		private readonly trackLanguageRepo: Repository<TrackLanguage>,

		@InjectRepository(Language)
		private readonly languageRepo: Repository<Language>,

		@InjectRepository(Track)
		private readonly trackRepo: Repository<Track>,

		@InjectRepository(Country)
		private readonly countryRepo: Repository<Country>,
	) {}

	async validate({
		trackId,
		audioLanguageId,
		metadataLanguageCountryId,
		metadataLanguageId,
		recordingCountryId,
	}: {
		trackId?: string | null;
		audioLanguageId?: string | null;
		metadataLanguageCountryId?: string | null;
		metadataLanguageId?: string | null;
		recordingCountryId?: string | null;
	}) {
		if (trackId) {
			const track = await this.trackRepo.findOne({
				where: { id: trackId },
			});

			const trackLanguage = await this.trackLanguageRepo.findOne({
				where: { trackId },
			});

			if (!track || trackLanguage) {
				throw new ResponseError({
					message:
						'Invalid trackId. Track does not exist or track already has a language.',
				});
			}
		}

		if (audioLanguageId) {
			const audioLanguage = await this.languageRepo.findOne({
				where: { id: audioLanguageId },
			});

			if (!audioLanguage) {
				throw new ResponseError({
					message: 'Invalid audioLanguageId',
				});
			}
		}

		if (metadataLanguageCountryId) {
			const metadataLanguageCountry = await this.countryRepo.findOne({
				where: { id: metadataLanguageCountryId },
			});

			if (!metadataLanguageCountry) {
				throw new ResponseError({
					message: 'Invalid metadataLanguageCountryId',
				});
			}
		}

		if (metadataLanguageId) {
			const metadataLanguage = await this.languageRepo.findOne({
				where: { id: metadataLanguageId },
			});

			if (!metadataLanguage) {
				throw new ResponseError({
					message: 'Invalid metadataLanguageId',
				});
			}
		}

		if (recordingCountryId) {
			const country = await this.countryRepo.findOne({
				where: { id: recordingCountryId },
			});

			if (!country) {
				throw new ResponseError({
					message: 'Invalid recordingCountryId',
				});
			}
		}
	}

	// ensureNonDraftTrackLanguage(
	// 	trackLanguage: ITrackLanguage,
	// ): ITrackLanguageNonDraft {
	// 	// if (trackLanguage.status === TrackLanguageStatus.DRAFT) {
	// 	// 	throw new ResponseError({ message: 'Invalid trackLanguage.status' });
	// 	// }

	// 	if (!trackLanguage.primaryGenreId) {
	// 		throw new ResponseError({
	// 			message: 'Invalid trackLanguage.primaryGenreId',
	// 		});
	// 	}

	// 	if (!trackLanguage.pLineOwner) {
	// 		throw new ResponseError({
	// 			message: 'Invalid trackLanguage.pLineOwner',
	// 		});
	// 	}

	// 	return trackLanguage as ITrackLanguageNonDraft;
	// }

	ensureDraftTrackLanguage(
		trackLanguage: ITrackLanguage,
	): ITrackLanguageDraft {
		// if (trackLanguage.status !== TrackLanguageStatus.DRAFT) {
		// 	throw new ResponseError({
		// 		message: 'Invalid trackLanguage.status',
		// 	});
		// }

		return trackLanguage as ITrackLanguageDraft;
	}
}
