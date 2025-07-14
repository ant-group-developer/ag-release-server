export interface IAudioFile {
	sampleRate: string;

	bitrate: string | null;

	bitDepth: number | null;

	duration: number;

	hook: number | null;

	trackId: string;

	fileId: string;

	peakId: string;
}

export interface IAudioFileDraft {
	sampleRate: string;

	bitrate: string | null;

	bitDepth: number | null;

	duration: number;

	hook: number | null;

	trackId: string;

	fileId: string;

	peakId: string;
}

export interface IAudioFileNonDraft extends IAudioFile {
	sampleRate: string;

	bitrate: string;

	bitDepth: number;

	duration: number;

	hook: number;

	trackId: string;

	fileId: string;

	peakId: string;
}

export interface IAudioFileBucket {
	sampleRate: string;

	bitrate: string | null;

	bitDepth: number | null;

	duration: number;

	hook: number | null;

	trackId: string;

	fileId: string;

	peakId: string;

	file: string;

	peak: string;
}
