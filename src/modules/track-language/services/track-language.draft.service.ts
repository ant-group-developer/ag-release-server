import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TrackLanguage } from '../entities/track-language.entity';
import {
	ICreateTrackLanguage,
	ITrackLanguageDraft,
	IUpdateTrackLanguage,
} from '../interfaces/track-language.interface';
import { TrackLanguageQueryService } from './track-language.query.service';
import { TrackLanguageValidateService } from './track-language.validate.service';

@Injectable()
export class TrackLanguageDraftService {
	constructor(
		@InjectRepository(TrackLanguage)
		private readonly trackLanguageRepo: Repository<TrackLanguage>,
		private readonly trackLanguageValidateService: TrackLanguageValidateService,

		private readonly trackLanguageQueryService: TrackLanguageQueryService,
	) {}

	async create(data: ICreateTrackLanguage): Promise<ITrackLanguageDraft> {
		const {
			trackId,
			audioLanguageId,
			metadataLanguageCountryId,
			metadataLanguageId,
		} = data;

		await this.trackLanguageValidateService.validate({
			trackId,
			audioLanguageId,
			metadataLanguageCountryId,
			metadataLanguageId,
		});

		const trackLanguage = this.trackLanguageRepo.create(data);
		const result = await this.trackLanguageRepo.save(trackLanguage);

		return this.trackLanguageValidateService.ensureDraftTrackLanguage(
			result,
		);
	}

	async update({
		id,
		trackLanguage,
	}: {
		id: string;
		trackLanguage: IUpdateTrackLanguage;
	}): Promise<ITrackLanguageDraft> {
		const {
			// trackId,
			audioLanguageId,
			metadataLanguageCountryId,
			metadataLanguageId,
		} = trackLanguage;

		const trackLanguageDb =
			await this.trackLanguageQueryService.findOne(id);

		// if (trackId && trackId !== trackLanguage.trackId) {
		// 	await this.trackLanguageValidateService.validate({
		// 		trackId,
		// 	});
		// }

		if (
			audioLanguageId &&
			audioLanguageId !== trackLanguage.audioLanguageId
		) {
			await this.trackLanguageValidateService.validate({
				audioLanguageId,
			});
		}

		if (
			metadataLanguageCountryId &&
			metadataLanguageCountryId !==
				trackLanguageDb.metadataLanguageCountryId
		) {
			await this.trackLanguageValidateService.validate({
				metadataLanguageCountryId,
			});
		}

		if (
			metadataLanguageId &&
			metadataLanguageId !== trackLanguage.metadataLanguageId
		) {
			await this.trackLanguageValidateService.validate({
				metadataLanguageId,
			});
		}

		await this.trackLanguageRepo.update(id, trackLanguage);
		const result = await this.trackLanguageQueryService.findOne(id);

		return this.trackLanguageValidateService.ensureDraftTrackLanguage(
			result,
		);
	}
}
