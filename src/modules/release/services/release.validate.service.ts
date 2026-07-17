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

import { NO_LINGUISTIC_CONTENT_LANGUAGE } from 'src/common/constants/common.default.constants';
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
		if (release.type === 'video') {
			return [];
		}
		const result: FieldErrorDetails[] = [];
		// if (skipValidateBucket) return result;

		if (release) {
			result.push(...this.validateRelease(release));
			if (!release.isInstrumental) {
				result.push(...this.validateLanguage(release.releaseLanguage));
			}
			result.push(...this.validateTracks(release.tracks));
		}

		return result;
	}

	private validateRelease(release: Release) {
		const requiredRoles = this.appConfigService.requiredArtistRoles;
		const result: FieldErrorDetails[] = [];

		const upc = release.upc?.trim();
		if (upc && (upc.length < 10 || upc.length > 14)) {
			result.push(
				new FieldErrorDetails({
					message: 'Mã UPC phải có từ 10 đến 14 ký tự',
					page: 'core-detail',
					field: 'upc',
				}),
			);
		}

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
		} else {
			if (release.title !== release.title.trim()) {
				result.push(
					new FieldErrorDetails({
						messageCode:
							'formFields.validate.noLeadingTrailingSpace',
						message: 'Tên không được có khoảng trắng ở đầu và cuối',
						page: 'core-detail',
						field: 'title',
					}),
				);
			}

			const featMatches = release.title.match(
				/\b(ft\.*|featuring|feat\.*)(?=\W|$)/gi,
			);
			if (featMatches) {
				result.push(
					new FieldErrorDetails({
						messageCode:
							'formFields.validate.titleCannotContainFeat',
						message: 'Tiêu đề không được chứa "feat"',
						page: 'core-detail',
						field: 'title',
					}),
				);
			}
		}

		// title validation
		const hasMatchingTitle = release.tracks.some(
			(t) => t.title === release.title,
		);

		const isSingle = release.albumFormat?.code === 'Single';

		if (isSingle && !hasMatchingTitle) {
			result.push(
				new FieldErrorDetails({
					messageCode:
						'formFields.validate.releaseNameMustMatchTrackName',
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
					messageCode: 'formFields.validate.coverArtIsRequired',
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
					messageCode: 'formFields.validate.atLeastOneMainArtist',
					page: 'core-detail',
					field: 'releaseArtists',
				}),
			);
		}

		const hasExplicitTrack = release.tracks?.some((track) =>
			this.isExplicitContent(track.trackSensitive?.code),
		);

		if (release.isInstrumental && hasExplicitTrack) {
			result.push(
				new FieldErrorDetails({
					messageCode:
						'formFields.validate.noLinguisticContentHasExplicitContent',
					message:
						'Explicit Content has been indicated on this release, but the metadata says there are no vocals. Update the release metadata to indicate the presence of vocals and language, or remove the Explicit Content flag.',
					page: 'core-detail',
					field: 'isInstrumental',
				}),
			);
		}

		const LYRICIST_ROLE_CODE = 'Lyricist';

		if (requiredRoles.length > 0) {
			let applicableRoles = requiredRoles;

			const isNoLinguisticContent =
				release.isInstrumental ||
				release.releaseLanguage?.audioLanguage?.code ===
					NO_LINGUISTIC_CONTENT_LANGUAGE;

			if (isNoLinguisticContent) {
				applicableRoles = applicableRoles.filter(
					(role) => role.code !== LYRICIST_ROLE_CODE,
				);

				const hasLyricist = release.releaseContributors?.some(
					(contributor) =>
						contributor.artistRole?.code === LYRICIST_ROLE_CODE,
				);

				if (hasLyricist) {
					result.push(
						new FieldErrorDetails({
							messageCode:
								'formFields.validate.noLinguisticContentHasLyricist',
							message:
								'Bản phát hành không có nội dung lời thì không được có contributor với vai trò Người viết lời',
							page: 'core-detail',
							field: 'releaseContributors',
						}),
					);
				}
			}

			const missingRoles = applicableRoles.filter(
				(role) =>
					!release.releaseContributors?.some(
						(contributor) =>
							contributor.artistRole?.code === role.code,
					),
			);

			if (missingRoles.length > 0) {
				const missing = missingRoles.map((role) => role.name);

				result.push(
					new FieldErrorDetails({
						messageCode: `formFields.validate.missingRequired.${missing.join('')}`,
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

		if (!tracks?.length) {
			result.push(
				new FieldErrorDetails({
					messageCode: 'formFields.validate.atLeastOneTrack',
					page: 'tracks',
					field: 'tracks',
				}),
			);
			return result;
		}

		tracks.forEach((track, index) => {
			const { trackLanguage } = track;
			const isInstrumental = track.isInstrumental;

			if (track.title) {
				if (track.title !== track.title.trim()) {
					result.push(
						new FieldErrorDetails({
							messageCode:
								'formFields.validate.noLeadingTrailingSpace',
							message:
								'Tên bài hát không được có khoảng trắng ở đầu và cuối',
							page: 'tracks',
							field: `tracks.${index}.title`,
							trackId: track.id,
						}),
					);
				}

				const featMatches = track.title.match(
					/\b(ft\.*|featuring|feat\.*)(?=\W|$)/gi,
				);
				if (featMatches) {
					result.push(
						new FieldErrorDetails({
							messageCode:
								'formFields.validate.titleCannotContainFeat',
							message: 'Tiêu đề không được chứa "feat"',
							page: 'tracks',
							field: `tracks.${index}.title`,
							trackId: track.id,
						}),
					);
				}
			}

			const isrc = track.isrc?.trim();
			if (isrc && isrc.length !== 12) {
				result.push(
					new FieldErrorDetails({
						messageCode:
							'formFields.validate.isrcMustBe12Characters',
						message: 'Mã ISRC phải có chính xác 12 ký tự',
						page: 'tracks',
						field: `tracks.${index}.isrc`,
						trackId: track.id,
					}),
				);
			}

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

			// track artists validation
			if (!track.trackArtists.length) {
				result.push(
					new FieldErrorDetails({
						messageCode: 'formFields.validate.atLeastOneMainArtist',
						page: 'tracks',
						field: `tracks.${index}.trackArtists`,
						trackId: track.id,
					}),
				);
			}

			// track contributors validation (Dynamic isRequired)
			const LYRICIST_ROLE_CODE = 'Lyricist';

			const isNoLinguisticContent =
				isInstrumental ||
				track.trackLanguage?.audioLanguage?.code ===
					NO_LINGUISTIC_CONTENT_LANGUAGE;

			if (
				isNoLinguisticContent &&
				this.isExplicitContent(track.trackSensitive?.code)
			) {
				result.push(
					new FieldErrorDetails({
						messageCode:
							'formFields.validate.noLinguisticContentHasExplicitContent',
						message:
							'Explicit Content has been indicated on this track, but the metadata says there are no vocals. Update the track metadata to indicate the presence of vocals and language, or remove the Explicit Content flag.',
						page: 'tracks',
						field: `tracks.${index}.trackSensitiveId`,
						trackId: track.id,
					}),
				);
			}

			if (isNoLinguisticContent) {
				const hasLyricist = track.trackContributors?.some(
					(contributor) =>
						contributor.artistRole?.code === LYRICIST_ROLE_CODE,
				);

				if (hasLyricist) {
					result.push(
						new FieldErrorDetails({
							messageCode:
								'formFields.validate.noLinguisticContentHasLyricist',
							message:
								'Track không có nội dung lời thì không được có contributor với vai trò Người viết lời',
							page: 'tracks',
							field: `tracks.${index}.trackContributors`,
							trackId: track.id,
						}),
					);
				}
			}

			const applicableRoles = isNoLinguisticContent
				? requiredRoles.filter(
						(role) => role.code !== LYRICIST_ROLE_CODE,
					)
				: requiredRoles;

			const missingRoles = applicableRoles.filter(
				(role) =>
					!track.trackContributors?.some(
						(contributor) =>
							contributor.artistRole?.code === role.code,
					),
			);

			if (missingRoles.length > 0) {
				const missing = missingRoles.map((role) => role.name);

				result.push(
					new FieldErrorDetails({
						messageCode: `formFields.validate.missingRequired.${missing.join('')}`,
						message: `Track bắt buộc phải có contributor với vai trò ${missing.join(' và ')}`,
						page: 'tracks',
						field: `tracks.${index}.trackContributors`,
						trackId: track.id,
					}),
				);
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

			if (!isInstrumental) {
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

	private isExplicitContent(code?: string | null): boolean {
		return [
			'Explicit',
			'ExplicitContentEdited',
			'NoAdviceAvailable',
		].includes(code?.trim() ?? '');
	}
}
