import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
	CreateReleaseLanguageDraftDto,
	UpdateReleaseLanguageDraftDto,
} from '../dto/release-language.draft.dto';
import { ReleaseLanguage } from '../entities/release-language.entity';
import { IReleaseLanguageDraft } from '../interfaces/release-language.interface';
import { ReleaseLanguageQueryService } from './release-language.query.service';
import { ReleaseLanguageValidateService } from './release-language.validate.service';

@Injectable()
export class ReleaseLanguageDraftService {
	constructor(
		@InjectRepository(ReleaseLanguage)
		private readonly releaseLanguageRepo: Repository<ReleaseLanguage>,
		private readonly releaseLanguageValidateService: ReleaseLanguageValidateService,

		private readonly releaseLanguageQueryService: ReleaseLanguageQueryService,
	) {}

	async create(
		data: CreateReleaseLanguageDraftDto,
	): Promise<IReleaseLanguageDraft> {
		const {
			releaseId,
			audioLanguageId,
			metadataLanguageCountryId,
			metadataLanguageId,
		} = data;

		await this.releaseLanguageValidateService.validate({
			releaseId,
			audioLanguageId,
			metadataLanguageCountryId,
			metadataLanguageId,
		});

		const releaseLanguage = this.releaseLanguageRepo.create(data);
		const result = await this.releaseLanguageRepo.save(releaseLanguage);

		return this.releaseLanguageValidateService.ensureDraftReleaseLanguage(
			result,
		);
	}

	async update(
		id: string,
		data: UpdateReleaseLanguageDraftDto,
	): Promise<IReleaseLanguageDraft> {
		const {
			releaseId,
			audioLanguageId,
			metadataLanguageCountryId,
			metadataLanguageId,
		} = data;

		const releaseLanguage =
			await this.releaseLanguageQueryService.findOne(id);

		if (releaseId && releaseId !== releaseLanguage.releaseId) {
			await this.releaseLanguageValidateService.validate({
				releaseId,
			});
		}

		if (
			audioLanguageId &&
			audioLanguageId !== releaseLanguage.audioLanguageId
		) {
			await this.releaseLanguageValidateService.validate({
				audioLanguageId,
			});
		}

		if (
			metadataLanguageCountryId &&
			metadataLanguageCountryId !==
				releaseLanguage.metadataLanguageCountryId
		) {
			await this.releaseLanguageValidateService.validate({
				metadataLanguageCountryId,
			});
		}

		if (
			metadataLanguageId &&
			metadataLanguageId !== releaseLanguage.metadataLanguageId
		) {
			await this.releaseLanguageValidateService.validate({
				metadataLanguageId,
			});
		}

		await this.releaseLanguageRepo.update(id, data);
		const result = await this.releaseLanguageQueryService.findOne(id);

		return this.releaseLanguageValidateService.ensureDraftReleaseLanguage(
			result,
		);
	}
}
