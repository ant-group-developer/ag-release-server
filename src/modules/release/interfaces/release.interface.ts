import { Genre } from 'src/modules/genre/entities/genre.entity';
import { Label } from 'src/modules/label/entities/label.entity';
import { ReleaseArtist } from 'src/modules/release-artist/entities/release-artist.entity';
import { ReleaseLanguage } from 'src/modules/release-language/entities/release-language.entity';
import {
	ReleaseStatus,
	ReleaseStatusNonDraft,
	ReleaseType,
} from '../enum/release.enum';

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
