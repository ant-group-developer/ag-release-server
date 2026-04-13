import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
	FieldErrorDetails,
	ResponseError,
} from 'src/common/dtos/common.response.dto';
import { AlbumFormat } from 'src/modules/album-format/entities/album-format.entity';
import { AppConfigService } from 'src/modules/app-config/app-config.service';
import { Genre } from 'src/modules/genre/entities/genre.entity';
import { Label } from 'src/modules/label/entities/label.entity';
import { Timezone } from 'src/modules/timezone/entities/timezone.entity';
import { Repository } from 'typeorm';

import { PriceTier } from 'src/modules/price-tiers/entities/price-tier.entity';
import { ReleaseException } from '../constants/release.constant';
import { UpdateReleaseDraftDto } from '../dto/release.draft.dto';
import { Release } from '../entities/release.entity';
import { ReleaseStatus, ReleaseTimeMode } from '../enum/release.enum';
import {
	IRelease,
	IReleaseDraft,
	IReleaseNonDraft,
} from '../interfaces/release.interface';

@Injectable()
export class ReleaseValidateService {
	constructor(
		@InjectRepository(AlbumFormat)
		private readonly albumFormatRepo: Repository<AlbumFormat>,

		@InjectRepository(Genre)
		private readonly genreRepo: Repository<Genre>,

		@InjectRepository(Label)
		private readonly labelRepo: Repository<Label>,

		@InjectRepository(Timezone)
		private readonly timezoneRepo: Repository<Timezone>,

		@InjectRepository(PriceTier)
		private readonly priceTierRepo: Repository<PriceTier>,

		private readonly appConfigService: AppConfigService,
	) {}

	async validate({
		albumFormatId,
		primaryGenreId,
		subGenreId,
		labelId,
		releaseTimezoneId,
		priceTierId,
	}: {
		albumFormatId?: string | null;
		primaryGenreId?: string | null;
		subGenreId?: string | null;
		labelId?: string | null;
		releaseTimezoneId?: string | null;
		priceTierId?: string | null;
	}) {
		if (albumFormatId) {
			const albumFormat = await this.albumFormatRepo.findOne({
				where: { id: albumFormatId },
			});

			if (!albumFormat) {
				throw ReleaseException.ALBUM_FORMAT_NOT_FOUND();
			}
		}

		if (primaryGenreId) {
			const genre = await this.genreRepo.findOne({
				where: { id: primaryGenreId },
			});

			if (!genre) {
				throw ReleaseException.PRIMARY_GENRE_NOT_FOUND();
			}
		}

		if (subGenreId) {
			const genre = await this.genreRepo.findOne({
				where: { id: subGenreId },
			});
			if (!genre) {
				throw ReleaseException.SUB_GENRE_NOT_FOUND();
			}
		}

		if (labelId) {
			const label = await this.labelRepo.findOne({
				where: { id: labelId },
			});
			if (!label) {
				throw ReleaseException.LABEL_NOT_FOUND();
			}
		}

		if (releaseTimezoneId) {
			const timezone = await this.timezoneRepo.findOne({
				where: { id: releaseTimezoneId },
			});

			if (!timezone) {
				throw ReleaseException.TIMEZONE_NOT_FOUND();
			}
		}

		if (priceTierId) {
			const priceTier = await this.priceTierRepo.findOne({
				where: { id: priceTierId },
			});

			if (!priceTier) {
				throw ReleaseException.PRICE_TIER_NOT_FOUND();
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
		const {
			albumFormatId,
			labelId,
			primaryGenreId,
			subGenreId,
			releaseTimezoneId,
			priceTierId,
		} = dataUpdate;

		if (albumFormatId && albumFormatId !== release.albumFormatId) {
			await this.validate({
				albumFormatId,
			});
		}

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

		if (priceTierId && priceTierId !== release.priceTierId) {
			await this.validate({
				priceTierId,
			});
		}
	}

	// validate schema release
	getErrorsSchemaRelease(
		release: Release,
		skipValidateBucket: boolean = false,
	) {
		const result: FieldErrorDetails[] = [];
		// if (skipValidateBucket) return result;

		if (release) {
			result.push(...this.validateRelease(release));
			result.push(...this.validateLanguage(release.releaseLanguage));
			result.push(...this.validateTracks(release.tracks));
		}

		return result;
	}

	private validateRelease(release: Release) {
		const requiredRoles = this.appConfigService.requiredArtistRoles;
		const result: FieldErrorDetails[] = [];

		if (!release.primaryGenreId) {
			result.push(
				new FieldErrorDetails({
					page: 'core-detail',
					field: 'primaryGenreId',
				}),
			);
		}

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

		// title validation
		const hasMatchingTitle = release.tracks.some(
			(t) => t.title === release.title,
		);
		if (!hasMatchingTitle) {
			result.push(
				new FieldErrorDetails({
					messageCode: 'formFields.releaseNameMustMatchTrackName',
					message:
						'Tên bản phát hành Single bắt buộc phải trùng khớp với tên ít nhất 1 bài hát',
					page: 'core-detail',
					field: 'title',
				}),
			);
		}

		if (!release.cLineYear) {
			result.push(
				new FieldErrorDetails({
					message: 'C Line Year is required',
					page: 'core-detail',
					field: 'cLineYear',
				}),
			);
		}

		if (!release.cLineOwner) {
			result.push(
				new FieldErrorDetails({
					message: 'C Line Owner is required',
					page: 'core-detail',
					field: 'cLineOwner',
				}),
			);
		}

		if (!release.pLineYear) {
			result.push(
				new FieldErrorDetails({
					message: 'P Line Year is required',
					page: 'core-detail',
					field: 'pLineYear',
				}),
			);
		}

		if (!release.pLineOwner) {
			result.push(
				new FieldErrorDetails({
					message: 'P Line Owner is required',
					page: 'core-detail',
					field: 'pLineOwner',
				}),
			);
		}

		// cover arts validation
		if (release.releaseCoverArts?.length === 0) {
			result.push(
				new FieldErrorDetails({
					page: 'core-detail',
					field: 'releaseCoverArts',
				}),
			);
		}

		// time release validation
		if (release.releaseTimeMode === ReleaseTimeMode.SPECIFIC_TIMEZONE) {
			if (!release.releaseTime) {
				result.push(
					new FieldErrorDetails({
						page: 'schedule',
						field: 'releaseTime',
					}),
				);
			}

			if (!release.releaseTimezoneId) {
				result.push(
					new FieldErrorDetails({
						page: 'schedule',
						field: 'releaseTimezoneId',
					}),
				);
			}
		}

		if (!release.releaseDate) {
			result.push(
				new FieldErrorDetails({
					page: 'schedule',
					field: 'releaseDate',
				}),
			);
		}

		if (!release.releaseOriginalDate) {
			result.push(
				new FieldErrorDetails({
					page: 'schedule',
					field: 'releaseOriginalDate',
				}),
			);
		}

		// release territory validation
		if (!release.releaseTerritory) {
			result.push(
				new FieldErrorDetails({
					page: 'schedule',
					field: 'releaseTerritory',
				}),
			);
		}

		if (release?.releaseTerritory?.distributeWorldwide === false) {
			if (release.releaseTerritory.distributionType === null) {
				result.push(
					new FieldErrorDetails({
						page: 'schedule',
						field: 'distributionType',
					}),
				);
			}

			if (release.releaseTerritory.selectedCountries?.length === 0) {
				result.push(
					new FieldErrorDetails({
						page: 'schedule',
						field: 'selectedCountries',
					}),
				);
			}
		}

		// release artists validation
		if (!release?.releaseArtists.length) {
			result.push(
				new FieldErrorDetails({
					page: 'core-detail',
					field: 'releaseArtists',
				}),
			);
		}

		// release contributors validation (Dynamic isRequired)
		if (requiredRoles.length > 0) {
			const missingRoles = requiredRoles.filter(
				(role) =>
					!release.releaseContributors?.some(
						(c) => c.artistRole?.code === role.code,
					),
			);

			if (missingRoles.length > 0) {
				const missing = missingRoles.map((r) => r.name);
				result.push(
					new FieldErrorDetails({
						message: `Bản phát hành bắt buộc phải có contributor với vai trò ${missing.join(' và ')}`,
						page: 'core-detail',
						field: 'releaseContributors',
					}),
				);
			}
		}

		return result;
	}

	private validateLanguage(releaseLanguage: Release['releaseLanguage']) {
		const result: FieldErrorDetails[] = [];

		if (!releaseLanguage?.metadataLanguageCountryId) {
			result.push(
				new FieldErrorDetails({
					page: 'core-detail',
					field: 'releaseLanguage.metadataLanguageCountryId',
				}),
			);
		}

		if (!releaseLanguage?.audioLanguageId) {
			result.push(
				new FieldErrorDetails({
					page: 'core-detail',
					field: 'releaseLanguage.audioLanguageId',
				}),
			);
		}

		if (!releaseLanguage?.metadataLanguageId) {
			result.push(
				new FieldErrorDetails({
					page: 'core-detail',
					field: 'releaseLanguage.metadataLanguageId',
				}),
			);
		}
		return result;
	}

	private validateTracks(tracks: Release['tracks']) {
		const requiredRoles = this.appConfigService.requiredArtistRoles;
		const result: FieldErrorDetails[] = [];

		tracks.forEach((track, index) => {
			const { trackLanguage } = track;
			if (!track.trackOriginTypeId) {
				result.push(
					new FieldErrorDetails({
						page: 'tracks',
						field: `tracks.${index}.trackOriginTypeId`,
						trackId: track.id,
					}),
				);
			}

			if (!track.primaryGenreId) {
				result.push(
					new FieldErrorDetails({
						page: 'tracks',
						field: `tracks.${index}.primaryGenreId`,
						trackId: track.id,
					}),
				);
			}

			if (!track.pLineOwner) {
				result.push(
					new FieldErrorDetails({
						page: 'tracks',
						field: `tracks.${index}.pLineOwner`,
						trackId: track.id,
					}),
				);
			}

			if (!track.pLineYear) {
				result.push(
					new FieldErrorDetails({
						page: 'tracks',
						field: `tracks.${index}.pLineYear`,
						trackId: track.id,
					}),
				);
			}

			if (!track.trackTypeId) {
				result.push(
					new FieldErrorDetails({
						page: 'tracks',
						field: `tracks.${index}.trackTypeId`,
						trackId: track.id,
					}),
				);
			}

			if (!track.trackLanguage.recordingCountryId) {
				result.push(
					new FieldErrorDetails({
						page: 'tracks',
						field: `tracks.${index}.trackLanguage.recordingCountryId`,
						trackId: track.id,
					}),
				);
			}

			// track artists validation
			if (!track.trackArtists.length) {
				result.push(
					new FieldErrorDetails({
						page: 'tracks',
						field: `tracks.${index}.trackArtists`,
						trackId: track.id,
					}),
				);
			}

			// track contributors validation (Dynamic isRequired)
			if (requiredRoles.length > 0) {
				const missingRoles = requiredRoles.filter(
					(role) =>
						!track.trackContributors?.some(
							(c) => c.artistRole?.code === role.code,
						),
				);

				if (missingRoles.length > 0) {
					const missing = missingRoles.map((r) => r.name);
					result.push(
						new FieldErrorDetails({
							message: `Track bắt buộc phải có contributor với vai trò ${missing.join(' và ')}`,
							page: 'tracks',
							field: `tracks.${index}.trackContributors`,
							trackId: track.id,
						}),
					);
				}
			}

			//
			if (track.audioFile && !track.audioFile.preview) {
				result.push(
					new FieldErrorDetails({
						page: 'tracks',
						field: `tracks.${index}.audioFile.preview`,
						trackId: track.id,
					}),
				);
			}

			if (!trackLanguage?.audioLanguageId) {
				result.push(
					new FieldErrorDetails({
						page: 'tracks',
						field: `tracks.${index}.trackLanguage.audioLanguageId`,
						trackId: track.id,
					}),
				);
			}

			if (!trackLanguage?.metadataLanguageId) {
				result.push(
					new FieldErrorDetails({
						page: 'tracks',
						field: `tracks.${index}.trackLanguage.metadataLanguageId`,
						trackId: track.id,
					}),
				);
			}

			if (!trackLanguage?.metadataLanguageCountryId) {
				result.push(
					new FieldErrorDetails({
						page: 'tracks',
						field: `tracks.${index}.trackLanguage.metadataLanguageCountryId`,
						trackId: track.id,
					}),
				);
			}

			if (!trackLanguage?.recordingCountryId) {
				result.push(
					new FieldErrorDetails({
						page: 'tracks',
						field: `tracks.${index}.trackLanguage.recordingCountryId`,
						trackId: track.id,
					}),
				);
			}

			if (!track.trackSensitiveId) {
				result.push(
					new FieldErrorDetails({
						page: 'tracks',
						field: `tracks.${index}.trackSensitiveId`,
						trackId: track.id,
					}),
				);
			}
		});

		return result;
	}
}
