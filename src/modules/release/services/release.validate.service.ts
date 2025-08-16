import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FieldErrorDetails, ResponseError } from 'src/common/dtos/response.dto';
import { AlbumFormat } from 'src/modules/album-format/entities/album-format.entity';
import { mainArtistRole } from 'src/modules/artist-role/constants/artist-role.constant';
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

		@InjectRepository(AlbumFormat)
		private readonly albumFormatRepo: Repository<AlbumFormat>,

		@InjectRepository(Genre)
		private readonly genreRepo: Repository<Genre>,

		@InjectRepository(Label)
		private readonly labelRepo: Repository<Label>,

		@InjectRepository(Timezone)
		private readonly timezoneRepo: Repository<Timezone>,
	) {}

	async validate({
		albumFormatId,
		primaryGenreId,
		subGenreId,
		labelId,
		releaseTimezoneId,
	}: {
		albumFormatId?: string | null;
		primaryGenreId?: string | null;
		subGenreId?: string | null;
		labelId?: string | null;
		releaseTimezoneId?: string | null;
	}) {
		if (albumFormatId) {
			const albumFormat = await this.albumFormatRepo.findOne({
				where: { id: albumFormatId },
			});

			if (!albumFormat) {
				throw new ResponseError({
					message: ReleaseMessageError.ALBUM_FORMAT_NOT_FOUND,
					messageCode: ReleaseMessageCodeError.ALBUM_FORMAT_NOT_FOUND,
				});
			}
		}

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
		const {
			albumFormatId,
			labelId,
			primaryGenreId,
			subGenreId,
			releaseTimezoneId,
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
	}

	// validate schema release
	async validateSchemaRelease(id: string) {
		const release = await this.releaseRepo.findOne({
			where: { id },
			relations: {
				albumFormat: true,
				releaseCoverArts: true,
				releaseArtists: {
					artistRole: true,
				},
				releaseLanguage: true,
				tracks: {
					trackLanguage: true,
					audioFile: true,
					trackArtists: {
						artistRole: true,
					},
				},
				releaseTerritory: true,
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

	private validateRelease(release: Release) {
		const result: FieldErrorDetails[] = [];

		// validate release.albumFormat
		if (release.tracks.length > release.albumFormat.maxTrackCount) {
			result.push(
				new FieldErrorDetails({
					page: 'tracks',
					field: 'maxTrackCount',
					// message: `${release.albumFormat.name} format cannot have more than ${release.albumFormat.maxTrackCount} tracks.`,
					message: `${release.albumFormat.maxTrackCount}`,
					messageCode: ReleaseMessageCodeError.ERROR_MAX_COUNT_TRACKS,
				}),
			);
		}

		if (release.tracks.length < release.albumFormat.minTrackCount) {
			result.push(
				new FieldErrorDetails({
					page: 'tracks',
					field: 'minTrackCount',
					// message: `${release.albumFormat.name} format cannot have less than ${release.albumFormat.minTrackCount} tracks.`,
					message: `${release.albumFormat.minTrackCount}`,
					messageCode: ReleaseMessageCodeError.ERROR_MIN_COUNT_TRACKS,
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
		if (!release.releaseTime) {
			result.push(
				new FieldErrorDetails({
					page: 'schedule',
					field: 'releaseTime',
				}),
			);
		}

		if (!release.releaseDate) {
			result.push(
				new FieldErrorDetails({
					page: 'schedule',
					field: 'releaseDate',
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
		if (
			release.isVariousArtist === false &&
			!release.releaseArtists.some(
				(ra) => ra.artistRole.code === mainArtistRole.code,
			)
		) {
			result.push(
				new FieldErrorDetails({
					page: 'core-detail',
					field: 'releaseArtists',
				}),
			);
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

			if (!track.pLineYear) {
				result.push(
					new FieldErrorDetails({
						page: 'tracks',
						field: `tracks.${index}.pLineYear`,
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

			// track artists validation
			if (
				!track.trackArtists.some(
					(ta) => ta.artistRole.code === mainArtistRole.code,
				)
			) {
				result.push(
					new FieldErrorDetails({
						page: 'tracks',
						field: `tracks.${index}.trackArtists`,
					}),
				);
			}

			//
			if (track.audioFile && !track.audioFile.preview) {
				result.push(
					new FieldErrorDetails({
						page: 'tracks',
						field: `tracks.${index}.audioFile.preview`,
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

	private validateTrackLanguage(
		trackLanguage: Release['tracks'][number]['trackLanguage'],
		index: number,
	) {
		const result: FieldErrorDetails[] = [];

		if (!trackLanguage?.audioLanguageId) {
			result.push(
				new FieldErrorDetails({
					page: 'tracks',
					field: `tracks.${index}.trackLanguage.audioLanguageId`,
				}),
			);
		}

		if (!trackLanguage?.metadataLanguageId) {
			result.push(
				new FieldErrorDetails({
					page: 'tracks',
					field: `tracks.${index}.trackLanguage.metadataLanguageId`,
				}),
			);
		}

		if (!trackLanguage?.metadataLanguageCountryId) {
			result.push(
				new FieldErrorDetails({
					page: 'tracks',
					field: `tracks.${index}.trackLanguage.metadataLanguageCountryId`,
				}),
			);
		}

		if (!trackLanguage?.recordingCountryId) {
			result.push(
				new FieldErrorDetails({
					page: 'tracks',
					field: `tracks.${index}.trackLanguage.recordingCountryId`,
				}),
			);
		}

		return result;
	}
}
