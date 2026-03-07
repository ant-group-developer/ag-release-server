//DTO
export interface ImportOneReleaseDto {
	id: string;
	upc: string;
	albumFormat: string | null;
	primaryGenre: string | null;
	subGenre: string | null;
	label: string | null;
	title: string | null;
	version: string | null;
	status: string;
	cLineYear: number | null;
	cLineOwner: string | null;
	pLineYear: number | null;
	pLineOwner: string | null;
	catalogId: string | null;
	isVariousArtist: boolean;
	releaseTimeMode: string;
	releaseTimezoneId: string | null;
	releaseDate: string | null;
	releaseTime: string | null;
	thumbnailId: string | null;
	tracks: ImportOneTrackDto[];
}

export interface ImportOneTrackDto {
	id: string;
	title: string | null;
	pLineYear: number | null;
	pLineOwner: string | null;
	primaryGenre: string | null;
	subGenre: string | null;
	order: number;
	trackType: string | null;
	trackSensitive: 'y' | 'n' | null;
	isByAi: 'y' | 'n' | null;
	lyric: string | null;
	priceTier: string | null;
	audioFile: ImportOneAudioFileDto | null;
}

export interface ImportOneAudioFileDto {
	sampleRate: string;
	bitrate: number;
	bitDepth: number;
	duration: number;
	sampleLength: number;
	preview: number;
	fileId: string;
}
