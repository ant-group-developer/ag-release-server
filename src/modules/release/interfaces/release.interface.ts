import { Genre } from 'src/modules/genre/entities/genre.entity';
import { Label } from 'src/modules/label/entities/label.entity';
import { ReleaseArtist } from 'src/modules/release-artist/entities/release-artist.entity';
import { ReleaseLanguage } from 'src/modules/release-language/entities/release-language.entity';

import { ReleaseDspDelivery } from '../entities/release-dsp-delivery.entity';
import { ReleaseStatus, ReleaseStatusNonDraft } from '../enum/release.enum';
import { ReleaseCiData } from '../modules/release-ci-data/entities/release-ci-data.entity';

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
	totalDuration?: number;
	dspsLive?: string;
	dspsLiveCount?: number;
	dspsTotalCount?: number;
	tenantId?: string;
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
	upc: string;
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
	tenantId?: string;
}

export interface ICoverArtThumbnails {
	'75x75': string | null;
	'100x100': string | null;
	'160x160': string | null;
	'300x300': string | null;
	original: string | null;
}

export interface IReleaseDetail extends Omit<IRelease, 'releaseCoverArt'> {
	coverArtThumbnails: ICoverArtThumbnails;
	releaseArtists: ReleaseArtist[];

	label: Label | null;
	primaryGenre: Genre | null;
	subGenre: Genre | null;
	releaseLanguage: ReleaseLanguage | null;
	releaseDspDeliveries?: ReleaseDspDelivery[];
	ciData: ReleaseCiData | null;
}
