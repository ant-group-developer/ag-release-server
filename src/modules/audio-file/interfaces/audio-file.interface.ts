export interface ICreateAudioFile {
	sampleRate: string;
	bitrate?: string | null;
	bitDepth?: number | null;
	duration: number;
	sampleLength?: number | null;
	preview?: number | null;
	trackId: string;
	fileId: string;
	peakId: string;
}

export interface IUpdateAudioFile {
	sampleLength?: number | null;
	preview?: number | null;

	sampleRate?: string;
	duration?: number;
	fileId?: string;
	peakId?: string;

	file?: {
		fileName: string;
	};
}

export interface IAudioFile {
	sampleRate: string;
	bitrate: string | null;
	bitDepth: number | null;
	duration: number;
	sampleLength: number | null;
	trackId: string;
	fileId: string;
	peakId: string;
}

export interface IAudioFileDraft {
	sampleRate: string;
	bitrate: string | null;
	bitDepth: number | null;
	duration: number;
	sampleLength: number | null;
	trackId: string;
	fileId: string;
	peakId: string;
}

export interface IAudioFileNonDraft extends IAudioFile {
	sampleRate: string;
	bitrate: string;
	bitDepth: number;
	duration: number;
	sampleLength: number;
	trackId: string;
	fileId: string;
	peakId: string;
}
