import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FieldErrorDetails, ResponseError } from 'src/common/dtos/response.dto';
import { Genre } from 'src/modules/genre/entities/genre.entity';
import { Label } from 'src/modules/label/entities/label.entity';
import { Timezone } from 'src/modules/timezone/entities/timezone.entity';
import { Repository } from 'typeorm';
import {
	ReleaseMessageCodeError,
	ReleaseMessageError,
} from '../constants/release.constant';
import { UpdateReleaseDraftDto } from '../dto/release.draft.dto';
import { Release } from '../entities/release.entity';
import { ReleaseStatus } from '../enum/release.enum';
import {
	IRelease,
	IReleaseDraft,
	IReleaseNonDraft,
} from '../interfaces/release.interface';

@Injectable()
export class ReleaseValidateService {
	constructor(
		@InjectRepository(Release)
		private readonly releaseRepo: Repository<Release>,

		@InjectRepository(Genre)
		private readonly genreRepo: Repository<Genre>,

		@InjectRepository(Label)
		private readonly labelRepo: Repository<Label>,

		@InjectRepository(Timezone)
		private readonly timezoneRepo: Repository<Timezone>,
	) {}

	async validate({
		primaryGenreId,
		subGenreId,
		labelId,
		releaseTimezoneId,
	}: {
		primaryGenreId?: string | null;
		subGenreId?: string | null;
		labelId?: string | null;
		releaseTimezoneId?: string | null;
	}) {
		if (primaryGenreId) {
			const genre = await this.genreRepo.findOne({
				where: { id: primaryGenreId },
			});

			if (!genre) {
				throw new ResponseError({
					message: ReleaseMessageError.PRIMARY_GENRE_NOT_FOUND,
					messageCode:
						ReleaseMessageCodeError.PRIMARY_GENRE_NOT_FOUND,
				});
			}
		}

		if (subGenreId) {
			const genre = await this.genreRepo.findOne({
				where: { id: subGenreId },
			});
			if (!genre) {
				throw new ResponseError({
					message: ReleaseMessageError.SUB_GENRE_NOT_FOUND,
					messageCode: ReleaseMessageCodeError.SUB_GENRE_NOT_FOUND,
				});
			}
		}

		if (labelId) {
			const label = await this.labelRepo.findOne({
				where: { id: labelId },
			});
			if (!label) {
				throw new ResponseError({
					message: ReleaseMessageError.LABEL_NOT_FOUND,
					messageCode: ReleaseMessageCodeError.LABEL_NOT_FOUND,
				});
			}
		}

		if (releaseTimezoneId) {
			const timezone = await this.timezoneRepo.findOne({
				where: { id: releaseTimezoneId },
			});

			if (!timezone) {
				throw new ResponseError({
					message: ReleaseMessageError.TIMEZONE_NOT_FOUND,
					messageCode: ReleaseMessageCodeError.TIMEZONE_NOT_FOUND,
				});
			}
		}
	}

	ensureNonDraftRelease(release: IRelease): IReleaseNonDraft {
		if (release.status === ReleaseStatus.DRAFT) {
			throw new ResponseError({ message: 'Invalid release.status' });
		}

		if (!release.primaryGenreId) {
			throw new ResponseError({
				message: 'Invalid release.primaryGenreId',
			});
		}

		if (!release.labelId) {
			throw new ResponseError({
				message: 'Invalid release.labelId',
			});
		}

		if (!release.cLineOwner) {
			throw new ResponseError({
				message: 'Invalid release.cLineOwner',
			});
		}

		if (!release.pLineOwner) {
			throw new ResponseError({
				message: 'Invalid release.pLineOwner',
			});
		}

		if (!release.releaseDate) {
			throw new ResponseError({
				message: 'Invalid release.releaseDate',
			});
		}

		return release as IReleaseNonDraft;
	}

	ensureDraftRelease(release: IRelease): IReleaseDraft {
		if (release.status !== ReleaseStatus.DRAFT) {
			throw new ResponseError({
				message: 'Invalid release.status',
			});
		}

		return release as IReleaseDraft;
	}

	async handleValidateDataUpdate({
		release,
		dataUpdate,
	}: {
		release: Release;
		dataUpdate: UpdateReleaseDraftDto;
	}) {
		const { labelId, primaryGenreId, subGenreId, releaseTimezoneId } =
			dataUpdate;

		if (labelId && labelId !== release.labelId) {
			await this.validate({
				labelId,
			});
		}

		if (primaryGenreId && primaryGenreId !== release.primaryGenreId) {
			await this.validate({
				primaryGenreId,
			});
		}

		if (subGenreId && subGenreId !== release.subGenreId) {
			await this.validate({
				subGenreId,
			});
		}

		if (
			releaseTimezoneId &&
			releaseTimezoneId !== release.releaseTimezoneId
		) {
			await this.validate({
				releaseTimezoneId,
			});
		}
	}

	// validate schema release
	async validateSchemaRelease(id: string) {
		const release = await this.releaseRepo.findOne({
			where: { id },
			relations: {
				releaseLanguage: true,
				tracks: {
					trackLanguage: true,
					audioFile: true,
				},
			},
		});

		const result: FieldErrorDetails[] = [];

		if (release) {
			result.push(...this.validateRelease(release));
			result.push(...this.validateLanguage(release.releaseLanguage));
			result.push(...this.validateTracks(release.tracks));
		}

		return result;
	}

	validateRelease(release: Release) {
		const result: FieldErrorDetails[] = [];

		if (!release.primaryGenreId) {
			result.push(
				new FieldErrorDetails({
					page: 'core-detail',
					field: 'primaryGenreId',
				}),
			);
			if (!release.labelId) {
				result.push(
					new FieldErrorDetails({
						page: 'core-detail',
						field: 'labelId',
					}),
				);
			}

			if (!release.title) {
				result.push(
					new FieldErrorDetails({
						page: 'core-detail',
						field: 'title',
					}),
				);
			}

			if (!release.cLineOwner) {
				result.push(
					new FieldErrorDetails({
						page: 'core-detail',
						field: 'cLineOwner',
					}),
				);
			}

			if (!release.pLineOwner) {
				result.push(
					new FieldErrorDetails({
						page: 'core-detail',
						field: 'pLineOwner',
					}),
				);
			}

			if (!release.releaseDate) {
				result.push(
					new FieldErrorDetails({
						page: 'core-detail',
						field: 'releaseDate',
					}),
				);
			}
		}

		return result;
	}

	validateLanguage(releaseLanguage: Release['releaseLanguage']) {
		const result: FieldErrorDetails[] = [];

		if (!releaseLanguage?.metadataLanguageCountryId) {
			result.push(
				new FieldErrorDetails({
					page: 'core-detail',
					field: 'metadataLanguageCountryId',
				}),
			);
		}

		if (!releaseLanguage?.audioLanguageId) {
			result.push(
				new FieldErrorDetails({
					page: 'core-detail',
					field: 'audioLanguageId',
				}),
			);
		}

		if (!releaseLanguage?.metadataLanguageId) {
			result.push(
				new FieldErrorDetails({
					page: 'core-detail',
					field: 'metadataLanguageId',
				}),
			);
		}
		return result;
	}

	validateTracks(tracks: Release['tracks']) {
		const result: FieldErrorDetails[] = [];
		tracks.forEach((track, index) => {
			if (!track.trackOriginTypeId) {
				result.push(
					new FieldErrorDetails({
						page: 'tracks',
						field: `tracks.${index}.trackOriginTypeId`,
					}),
				);
			}

			if (!track.primaryGenreId) {
				result.push(
					new FieldErrorDetails({
						page: 'tracks',
						field: `tracks.${index}.primaryGenreId`,
					}),
				);
			}

			if (!track.pLineOwner) {
				result.push(
					new FieldErrorDetails({
						page: 'tracks',
						field: `tracks.${index}.pLineOwner`,
					}),
				);
			}

			if (!track.primaryGenreId) {
				result.push(
					new FieldErrorDetails({
						page: 'tracks',
						field: `tracks.${index}.primaryGenreId`,
					}),
				);
			}

			if (!track.trackTypeId) {
				result.push(
					new FieldErrorDetails({
						page: 'tracks',
						field: `tracks.${index}.trackTypeId`,
					}),
				);
			}

			// audio file validation
			if (!track.audioFile.hook) {
				result.push(
					new FieldErrorDetails({
						page: 'tracks',
						field: `tracks.${index}.hook`,
					}),
				);
			}

			// language validation
			result.push(
				...this.validateTrackLanguage(track.trackLanguage, index),
			);
		});

		return result;
	}

	validateTrackLanguage(
		trackLanguage: Release['tracks'][number]['trackLanguage'],
		index: number,
	) {
		const result: FieldErrorDetails[] = [];

		if (!trackLanguage?.audioLanguageId) {
			result.push(
				new FieldErrorDetails({
					page: 'tracks',
					field: `tracks.${index}.audioLanguageId`,
				}),
			);
		}

		if (!trackLanguage?.metadataLanguageId) {
			result.push(
				new FieldErrorDetails({
					page: 'tracks',
					field: `tracks.${index}.metadataLanguageId`,
				}),
			);
		}

		if (!trackLanguage?.metadataLanguageCountryId) {
			result.push(
				new FieldErrorDetails({
					page: 'tracks',
					field: `tracks.${index}.metadataLanguageCountryId`,
				}),
			);
		}

		return result;
	}
}
