import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TrackLanguage } from '../entities/track-language.entity';
import { TrackLanguageValidateService } from './track-language.validate.service';
import { TrackLanguageQueryService } from './track-language.query.service';
import { CreateTrackLanguageDraftDto, UpdateTrackLanguageDraftDto } from '../dto/track-language.draft.dto';
import { ICreateTrackLanguage, ITrackLanguageDraft, IUpdateTrackLanguage } from '../interfaces/track-language.interface';


@Injectable()
export class TrackLanguageDraftService {
	constructor(
		@InjectRepository(TrackLanguage)
		private readonly trackLanguageRepo: Repository<TrackLanguage>,
		private readonly trackLanguageValidateService: TrackLanguageValidateService,

		private readonly trackLanguageQueryService: TrackLanguageQueryService,
	) { }

	async create(
		data: ICreateTrackLanguage,
	): Promise<ITrackLanguageDraft> {
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

	async update(
		id: string,
		data: IUpdateTrackLanguage,
	): Promise<ITrackLanguageDraft> {
		const {
			// trackId,
			audioLanguageId,
			metadataLanguageCountryId,
			metadataLanguageId,
		} = data;

		const trackLanguage =
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
			trackLanguage.metadataLanguageCountryId
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

		await this.trackLanguageRepo.update(id, data);
		const result = await this.trackLanguageQueryService.findOne(id);

		return this.trackLanguageValidateService.ensureDraftTrackLanguage(
			result,
		);
	}
}
