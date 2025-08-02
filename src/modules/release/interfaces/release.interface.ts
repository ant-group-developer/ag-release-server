import { FieldErrorDetails } from 'src/common/dtos/response.dto';
import { Genre } from 'src/modules/genre/entities/genre.entity';
import { Label } from 'src/modules/label/entities/label.entity';
import { ReleaseArtist } from 'src/modules/release-artist/entities/release-artist.entity';
import { ReleaseLanguage } from 'src/modules/release-language/entities/release-language.entity';
import z from 'zod';
import { ReleaseStatus, ReleaseStatusNonDraft } from '../enum/release.enum';

export interface IRelease {
	albumFormatId: string;
	upc: string | null;
	primaryGenreId: string | null;
	subGenreId: string | null;
	labelId: string | null;
	title: string;
	version: string | null;
	status: ReleaseStatus;
	releaseTimezoneId: string | null;
	cLineOwner: string | null;
	pLineOwner: string | null;
	catalogId: string | null;
	releaseDate: Date | null;
	releaseTime: string | null;
}

export interface IReleaseDraft {
	upc: string | null;
	primaryGenreId: string | null;
	subGenreId: string | null;
	labelId: string | null;
	title: string;
	version: string | null;
	status: ReleaseStatus.DRAFT;
	albumFormatId: string;
	releaseTimezoneId: string | null;
	cLineOwner: string | null;
	pLineOwner: string | null;
	catalogId: string | null;
	releaseDate: Date | null;
	releaseTime: string | null;
}

export interface IReleaseNonDraft {
	upc: string | null;
	primaryGenreId: string;
	subGenreId: string | null;
	labelId: string;
	title: string;
	version: string | null;
	status: ReleaseStatusNonDraft;
	albumFormatId: string;
	releaseTimezoneId: string | null;
	cLineOwner: string;
	pLineOwner: string;
	catalogId: string | null;
	releaseDate: Date;
	releaseTime: string | null;
}

export interface ICoverArtThumbnails {
	'75x75': string | null;
	'100x100': string | null;
	'160x160': string | null;
	'300x300': string | null;
	'900x900': string | null;
	original: string | null;
}

export interface IReleaseDetail extends Omit<IRelease, 'releaseCoverArt'> {
	coverArtThumbnails: ICoverArtThumbnails;
	releaseArtists: ReleaseArtist[];
	label: Label | null;
	primaryGenre: Genre | null;
	subGenre: Genre | null;
	releaseLanguage: ReleaseLanguage | null;
}

export const releaseSchema = z.object({
	primaryGenreId: z.string({
		message: JSON.stringify(
			new FieldErrorDetails({
				page: 'core-detail',
				field: 'primaryGenreId',
			}),
		),
	}),

	labelId: z
		.string({
			message: JSON.stringify(
				new FieldErrorDetails({
					page: 'core-detail',
					field: 'labelId',
				}),
			),
		})
		.optional(),

	cLineOwner: z
		.string({
			message: JSON.stringify(
				new FieldErrorDetails({
					page: 'core-detail',
					field: 'cLineOwner',
				}),
			),
		})
		.min(5, {
			message: JSON.stringify(
				new FieldErrorDetails({
					message: 'C Line Owner is required',
					page: 'core-detail',
					field: 'cLineOwner',
				}),
			),
		}),

	pLineOwner: z
		.string({
			message: JSON.stringify(
				new FieldErrorDetails({
					page: 'core-detail',
					field: 'pLineOwner',
				}),
			),
		})
		.min(5, {
			message: JSON.stringify(
				new FieldErrorDetails({
					message: 'P Line Owner is required',
					page: 'core-detail',
					field: 'pLineOwner',
				}),
			),
		}),

	// art
	releaseCoverArts: z.array(z.any()).min(1, {
		message: JSON.stringify(
			new FieldErrorDetails({
				page: 'core-detail',
				field: 'releaseCoverArts',
			}),
		),
	}),

	// artists
	isVariousArtist: z.boolean(),
	releaseArtists: z.array(
		z.object({
			artistRole: z.object({
				name: z.string(),
			}),
		}),
	),

	// date
	releaseTime: z
		.string({
			message: JSON.stringify(
				new FieldErrorDetails({
					page: 'schedule',
					field: 'releaseTime',
				}),
			),
		})
		.min(1, {
			message: JSON.stringify(
				new FieldErrorDetails({
					page: 'schedule',
					field: 'releaseTime',
				}),
			),
		}),
	releaseDate: z
		.string({
			message: JSON.stringify(
				new FieldErrorDetails({
					page: 'schedule',
					field: 'releaseDate',
				}),
			),
		})
		.min(1, {
			message: JSON.stringify(
				new FieldErrorDetails({
					page: 'schedule',
					field: 'releaseDate',
				}),
			),
		}),
	releaseTimezoneId: z
		.string({
			message: JSON.stringify(
				new FieldErrorDetails({
					page: 'schedule',
					field: 'releaseTimezoneId',
				}),
			),
		})
		.min(1, {
			message: JSON.stringify(
				new FieldErrorDetails({
					page: 'schedule',
					field: 'releaseTimezoneId',
				}),
			),
		}),

	releaseTerritory: z
		.object({
			distributeWorldwide: z.boolean(),
			distributionType: z.string().nullable().optional(),
			selectedCountries: z.array(z.any()).nullable().optional(),
		})
		.loose()
		.refine((val) => val !== null && val !== undefined, {
			message: JSON.stringify(
				new FieldErrorDetails({
					page: 'schedule',
					field: 'releaseTerritory',
				}),
			),
		})
		.refine(
			(val) => {
				if (val.distributeWorldwide === false) {
					return val.distributionType !== null;
				}
				return true;
			},
			{
				message: JSON.stringify(
					new FieldErrorDetails({
						page: 'schedule',
						field: 'distributionType',
					}),
				),
			},
		)
		.refine(
			(val) => {
				if (val.distributeWorldwide === false) {
					return (
						Array.isArray(val.selectedCountries) &&
						val.selectedCountries.length > 0
					);
				}
				return true;
			},
			{
				message: JSON.stringify(
					new FieldErrorDetails({
						page: 'schedule',
						field: 'selectedCountries',
					}),
				),
			},
		),
});
