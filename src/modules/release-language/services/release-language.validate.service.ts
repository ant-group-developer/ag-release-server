import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ResponseError } from 'src/common/dtos/response.dto';
import { Country } from 'src/modules/country/entities/country.entity';
import { Language } from 'src/modules/language/entities/language.entity';
import { Release } from 'src/modules/release/entities/release.entity';
import { Repository } from 'typeorm';
import { ReleaseLanguage } from '../entities/release-language.entity';
import {
	IReleaseLanguage,
	IReleaseLanguageDraft,
} from '../interfaces/release-language.interface';

@Injectable()
export class ReleaseLanguageValidateService {
	constructor(
		@InjectRepository(ReleaseLanguage)
		private readonly releaseLanguageRepo: Repository<ReleaseLanguage>,

		@InjectRepository(Language)
		private readonly languageRepo: Repository<Language>,

		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,

		@InjectRepository(Country)
		private readonly countryRepo: Repository<Country>,
	) {}

	async validate({
		releaseId,
		audioLanguageId,
		metadataLanguageCountryId,
		metadataLanguageId,
	}: {
		releaseId?: string | null;
		audioLanguageId?: string | null;
		metadataLanguageCountryId?: string | null;
		metadataLanguageId?: string | null;
	}) {
		if (releaseId) {
			const release = await this.releaseRepo.findOne({
				where: { id: releaseId },
			});

			const releaseLanguage = await this.releaseLanguageRepo.findOne({
				where: { releaseId },
			});

			if (!release || releaseLanguage) {
				throw new ResponseError({
					message: 'Invalid releaseId',
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
	}

	// ensureNonDraftReleaseLanguage(
	// 	releaseLanguage: IReleaseLanguage,
	// ): IReleaseLanguageNonDraft {
	// 	// if (releaseLanguage.status === ReleaseLanguageStatus.DRAFT) {
	// 	// 	throw new ResponseError({ message: 'Invalid releaseLanguage.status' });
	// 	// }

	// 	if (!releaseLanguage.primaryGenreId) {
	// 		throw new ResponseError({
	// 			message: 'Invalid releaseLanguage.primaryGenreId',
	// 		});
	// 	}

	// 	if (!releaseLanguage.pLineOwner) {
	// 		throw new ResponseError({
	// 			message: 'Invalid releaseLanguage.pLineOwner',
	// 		});
	// 	}

	// 	return releaseLanguage as IReleaseLanguageNonDraft;
	// }

	ensureDraftReleaseLanguage(
		releaseLanguage: IReleaseLanguage,
	): IReleaseLanguageDraft {
		// if (releaseLanguage.status !== ReleaseLanguageStatus.DRAFT) {
		// 	throw new ResponseError({
		// 		message: 'Invalid releaseLanguage.status',
		// 	});
		// }

		return releaseLanguage as IReleaseLanguageDraft;
	}
}
