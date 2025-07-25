import { Genre } from 'src/modules/genre/entities/genre.entity';
import { Label } from 'src/modules/label/entities/label.entity';
import { ReleaseArtist } from 'src/modules/release-artist/entities/release-artist.entity';
import { ReleaseLanguage } from 'src/modules/release-language/entities/release-language.entity';
import {
	ReleaseStatus,
	ReleaseStatusNonDraft,
	ReleaseType,
} from '../enum/release.enum';

import { z } from 'zod';

export interface IRelease {
	upc: string | null;
	primaryGenreId: string | null;
	subGenreId: string | null;
	labelId: string | null;
	title: string;
	version: string | null;
	status: ReleaseStatus;
	type: ReleaseType;
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
	type: ReleaseType;
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
	type: ReleaseType;
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

export const ReleaseSchema = z.object({
	upc: z.string().nullable().optional(),
	primaryGenreId: z.string().length(10),
	subGenreId: z.string().nullable().optional(),
	labelId: z.string().length(10),
	title: z.string().max(150),
	version: z.string().nullable().optional(),
	status: z.enum([
		ReleaseStatus.DRAFT,
		ReleaseStatus.PROCESSING,
		ReleaseStatus.ISSUES,
		ReleaseStatus.NEVER_DISTRIBUTED,
		ReleaseStatus.DISTRIBUTED,
		ReleaseStatus.TAKEN_DOWN,
	]),
	type: z.enum([ReleaseType.ALBUM, ReleaseType.SINGLE, ReleaseType.EP]),
	releaseTimezoneId: z.string().uuid().nullable().optional(),
	cLineOwner: z.string().max(200).nullable().optional(),
	pLineOwner: z.string().max(200).nullable().optional(),
	catalogId: z.string().max(100).nullable().optional(),
	releaseDate: z.date().nullable().optional(),
	releaseTime: z.string().length(5).nullable().optional(),
	isVariousArtist: z.boolean(),
});
