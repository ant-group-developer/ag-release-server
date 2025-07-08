import {
	IAudioFile,
	IAudioFileBucket,
} from 'src/modules/audio-file/interfaces/audio-file.interface';

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

export interface ITrackWithAudio extends ITrack {
	audioFile: IAudioFile;
}

export interface ITrackAudioBucket extends ITrack {
	audioFileBucket: IAudioFileBucket;
}
