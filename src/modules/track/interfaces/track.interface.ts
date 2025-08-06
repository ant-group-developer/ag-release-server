import { TrackArtist } from 'src/modules/track-artist/entities/track-artist.entity';

// type
export interface ITrack {
	title: string;
	version: string | null;
	isrc: string | null;
	iswc: string | null;
	releaseId: string;
	pLineOwner: string | null;
	primaryGenreId: string | null;
	subGenreId: string | null;
	trackArtists: TrackArtist[] | [];
}

export interface ITrackDraft {
	title: string;
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
	version: string | null;
	isrc: string | null;
	iswc: string | null;
	releaseId: string;
	pLineOwner: string;
	primaryGenreId: string;
	subGenreId: string | null;
}

//
export interface IHandleCreateTrackOne extends ICreateTrackDraft {
	audioFileDraft: IAudioFileDraft;

	trackLanguage?: ITrackLanguage;
}
export interface ICreateTrackDraft {
	title: string;
	version?: string | null;
	isrc?: string;
	iswc?: string;
	releaseId: string;
	pLineOwner?: string | null;
	primaryGenreId?: string | null;
	subGenreId?: string | null;
}

interface ITrackLanguage {
	metadataLanguageCountryId?: string | null;
	audioLanguageId?: string | null;
	metadataLanguageId?: string | null;
	recordingCountryId?: string | null;
}

interface IAudioFileDraft {
	sampleRate: string;
	bitrate?: string | null;
	bitDepth?: number | null;
	duration: number;
	hook?: number | null;
	preview?: number | null;
	fileId: string;
	peakId: string;
}
