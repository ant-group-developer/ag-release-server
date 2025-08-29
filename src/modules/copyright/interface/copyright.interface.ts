import { ScanStatus } from '../enums/copyright.enum';

// task
export interface ICreateTask {
	status: ScanStatus;
	filter: TrackScanFilter;
	trackNeedScanIds: string[];
	chunkDuration: number;
}

interface AcrArtist {
	name: string;
	langs?: { name: string; code: string }[];
	roles?: string[];
}

interface AcrAlbum {
	name: string;
	id?: string;
}

interface AcrGenre {
	id?: number;
	name: string;
}

interface AcrExternalMetadata {
	spotify?: {
		track?: { id: string; name: string };
		album?: { id: string; name: string };
		artists?: { id: string; name: string }[];
	};
	deezer?: {
		track?: { id: string; name: string };
		album?: { id: string; name: string };
		artists?: {
			id?: string;
			name: string;
			langs?: { name: string; code: string }[];
		}[];
	};
	youtube?: {
		vid: string;
	};
	[key: string]: any;
}

interface AcrExternalIds {
	isrc?: string;
	upc?: string;
	[key: string]: string | undefined;
}

interface AcrMusicItem {
	release_date?: string;
	duration_ms?: number | string;
	artists: AcrArtist[];
	db_begin_time_offset_ms?: number;
	db_end_time_offset_ms?: number;
	sample_begin_time_offset_ms?: number;
	sample_end_time_offset_ms?: number;
	play_offset_ms: number;
	result_from: number;
	acrid: string;
	title: string;
	album?: AcrAlbum;
	label?: string;
	score: number;
	external_metadata?: AcrExternalMetadata;
	external_ids?: AcrExternalIds;
	genres?: AcrGenre[];
	language?: string;
}

interface AcrHummingItem {
	release_date?: string;
	duration_ms?: number | string;
	artists: AcrArtist[];
	label?: string;
	play_offset_ms: number;
	result_from: number;
	acrid: string;
	title: string;
	album?: AcrAlbum;
	external_metadata?: AcrExternalMetadata;
	external_ids?: AcrExternalIds;
	score: number;
	language?: string;
	langs?: { name: string; code: string }[];
}

export interface AcrMetadata {
	music?: AcrMusicItem[];
	humming?: AcrHummingItem[];
}

export interface AcrResponse {
	status: {
		version: string;
		msg: string;
		code: number;
	};
	result_type?: number;
	cost_time?: number;
	metadata?: AcrMetadata;
}

export interface ResultScan {
	key: {
		startSecond: number;
		endSecond: number;
	};
	content: AcrMetadata | null;
}

// track scan status
export interface TrackScanFilter {
	trackCreatedAtStart: Date | null;
	trackCreatedAtEnd: Date | null;
	releaseIds: string[] | null;
	trackIds: string[] | null;
	ignoreTrackScanned: boolean;
}

//
export interface ICreateResultScan {
	trackId: string;
	result: ResultScan[];
}

export interface ICopyrightBasic {
	start: number;
	end: number;
	score: number;
	acrid: string;
}
