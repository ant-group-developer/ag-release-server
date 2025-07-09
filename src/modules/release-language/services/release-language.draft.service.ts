import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateReleaseLanguageDraftDto } from '../dto/release-language.draft.dto';
import { ReleaseLanguage } from '../entities/release-language.entity';
import { IReleaseLanguageDraft } from '../interfaces/release-language.interface';
import { ReleaseLanguageValidateService } from './release-language.validate.service';

@Injectable()
export class ReleaseLanguageDraftService {
	constructor(
		@InjectRepository(ReleaseLanguage)
		private readonly releaseLanguageRepo: Repository<ReleaseLanguage>,
		private readonly releaseLanguageValidateService: ReleaseLanguageValidateService,

		// private readonly releaseLanguageQueryService: ReleaseLanguageQueryService,
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

	// async update(
	// 	id: string,
	// 	data: UpdateReleaseLanguageDraftDto,
	// ): Promise<IReleaseLanguageDraft> {
	// 	const {
	// 		// releaseId,
	// 		primaryGenreId,
	// 		subGenreId,
	// 	} = data;

	// 	const releaseLanguage =
	// 		await this.releaseLanguageQueryService.findOne(id);

	// 	// if (releaseId && releaseId !== releaseLanguage.releaseId) {
	// 	// 	await this.releaseLanguageValidateService.validate({
	// 	// 		releaseId,
	// 	// 	});
	// 	// }

	// 	if (
	// 		primaryGenreId &&
	// 		primaryGenreId !== releaseLanguage.primaryGenreId
	// 	) {
	// 		await this.releaseLanguageValidateService.validate({
	// 			primaryGenreId,
	// 		});
	// 	}

	// 	if (subGenreId && subGenreId !== releaseLanguage.subGenreId) {
	// 		await this.releaseLanguageValidateService.validate({
	// 			subGenreId,
	// 		});
	// 	}

	// 	await this.releaseLanguageRepo.update(id, data);
	// 	const result = await this.releaseLanguageQueryService.findOne(id);

	// 	return this.releaseLanguageValidateService.ensureDraftReleaseLanguage(
	// 		result,
	// 	);
	// }
}
