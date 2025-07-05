export interface ITrack {
	title: string;

	picture: string | null;

	version: string | null;

	isrc: string | null;

	iswc: string | null;

	releaseId: string;

	pLineOwner: string | null;

	primaryGenreId: string | null;

	subGenreId: string | null;
}

export interface ITrackDraft {
	title: string;

	picture: string | null;

	version: string | null;

	isrc: string | null;

	iswc: string | null;

	releaseId: string;

	pLineOwner: string | null;

	primaryGenreId: string | null;

	subGenreId: string | null;
}

export interface ITrackNonDraft {
	title: string;

	picture: string | null;

	version: string | null;

	isrc: string | null;

	iswc: string | null;

	releaseId: string;

	pLineOwner: string;

	primaryGenreId: string;

	subGenreId: string | null;
}
