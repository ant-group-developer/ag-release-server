import { IAudioFileBucket } from 'src/modules/audio-file/interfaces/audio-file.interface';
import { TrackArtist } from 'src/modules/track-artist/entities/track-artist.entity';

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

export interface ITrackDetails {
	title: string;
	version: string | null;
	isrc: string | null;
	iswc: string | null;
	releaseId: string;
	pLineOwner: string | null;
	primaryGenreId: string | null;
	subGenreId: string | null;
	trackArtists: TrackArtist[] | [];

	audioFile: IAudioFileBucket | null;
}
