import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Release } from 'src/modules/release/entities/release.entity';
import { Repository } from 'typeorm';
import { UpdateReleaseLanguageDraftDto } from '../dto/release-language.draft.dto';
import { ReleaseLanguage } from '../entities/release-language.entity';
import {
	ICreateReleaseLanguage,
	IUpdateReleaseLanguage,
} from '../interfaces/release-language.interface';
import { ReleaseLanguageQueryService } from './release-language.query.service';
import { ReleaseLanguageValidateService } from './release-language.validate.service';

@Injectable()
export class ReleaseLanguageDraftService {
	private readonly logger = new Logger(ReleaseLanguageDraftService.name);

	constructor(
		@InjectRepository(ReleaseLanguage)
		private readonly releaseLanguageRepo: Repository<ReleaseLanguage>,
		private readonly releaseLanguageValidateService: ReleaseLanguageValidateService,

		private readonly releaseLanguageQueryService: ReleaseLanguageQueryService,
	) {}

	async create(data: ICreateReleaseLanguage) {
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
		await this.releaseLanguageRepo.save(releaseLanguage);
	}

	async handleUpdateReleaseLanguage({
		release,
		releaseLanguage,
	}: {
		release: Release;
		releaseLanguage?: UpdateReleaseLanguageDraftDto;
	}) {
		if (release.releaseLanguage?.id) {
			await this.update({
				id: release.releaseLanguage.id,
				dataUpdate: { ...releaseLanguage },
			});
		} else {
			await this.create({
				releaseId: release.id,
				...releaseLanguage,
			});
		}
	}

	async update({
		id,
		dataUpdate,
	}: {
		id: string;
		dataUpdate: IUpdateReleaseLanguage;
	}) {
		const {
			audioLanguageId,
			metadataLanguageCountryId,
			metadataLanguageId,
		} = dataUpdate;

		const releaseLanguage =
			await this.releaseLanguageQueryService.findOne(id);

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

		await this.releaseLanguageRepo.update(id, dataUpdate);
	}

	async deleteRecordOfRelease({
		releaseId,
	}: {
		releaseId: string;
	}): Promise<void> {
		await this.releaseLanguageRepo.delete({ releaseId });
	}
}
