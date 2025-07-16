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
			recordingCountryId,
		} = data;

		await this.trackLanguageValidateService.validate({
			trackId,
			audioLanguageId,
			metadataLanguageCountryId,
			metadataLanguageId,
			recordingCountryId,
		});

		const trackLanguage = this.trackLanguageRepo.create(data);
		const result = await this.trackLanguageRepo.save(trackLanguage);

		return this.trackLanguageValidateService.ensureDraftTrackLanguage(
			result,
		);
	}

	async update({
		id,
		dataUpdate,
	}: {
		id: string;
		dataUpdate: IUpdateTrackLanguage;
	}): Promise<ITrackLanguageDraft> {
		const {
			audioLanguageId,
			metadataLanguageCountryId,
			metadataLanguageId,
			recordingCountryId,
		} = dataUpdate;

		const trackLanguageDb =
			await this.trackLanguageQueryService.findOne(id);

		if (
			audioLanguageId &&
			audioLanguageId !== trackLanguageDb.audioLanguageId
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
			metadataLanguageId !== trackLanguageDb.metadataLanguageId
		) {
			await this.trackLanguageValidateService.validate({
				metadataLanguageId,
			});
		}

		if (
			recordingCountryId &&
			recordingCountryId !== trackLanguageDb.recordingCountryId
		) {
			await this.trackLanguageValidateService.validate({
				recordingCountryId,
			});
		}

		await this.trackLanguageRepo.update(id, dataUpdate);
		const result = await this.trackLanguageQueryService.findOne(id);

		return this.trackLanguageValidateService.ensureDraftTrackLanguage(
			result,
		);
	}

	async deleteRecordOfTrack({ trackId }: { trackId: string }): Promise<void> {
		await this.trackLanguageRepo.delete({ trackId });
	}
}
