import { AlbumFormat } from 'src/modules/album-format/entities/album-format.entity';
import { DistributionType } from 'src/modules/release-territory/enum/release-dsp.enum';

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
	tenantId?: string;
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
	// peakId: string;
	peakFileId: string;
}

export interface LookupMaps {
	// Release
	albumFormat: Map<string, string>;
	albumFormatEntity: Map<string, AlbumFormat>;
	genre: Map<string, string>;
	label: Map<string, string>;

	// Language
	language: Map<string, string>;

	// Country
	country: Map<string, string>;

	// Track
	trackType: Map<string, string>;
	trackSensitive: Map<string, string>;
	trackOriginType: Map<string, string>;

	// Pricing
	priceTier: Map<string, string>;

	// Territory
	distributionType: Map<string, DistributionType>;
}

// version 2
export interface ReleaseRawSftp {
	/** Dùng trực tiếp: id release */
	id: string;

	/** Dùng trực tiếp: lưu vào releases.upc */
	upc?: string;

	/** Dùng trực tiếp: lưu vào releases.title */
	title?: string;

	/** Dùng trực tiếp: lưu vào releases.version */
	version?: string;

	/** Cần tìm trong DB: albumFormat name -> lấy id gán vào releases.albumFormatId */
	albumFormat?: string;

	/** Cần tìm trong DB: genre name -> lấy id gán vào releases.primaryGenreId */
	primaryGenre?: string;

	/** Cần tìm trong DB: genre name -> lấy id gán vào releases.subGenreId */
	subGenre?: string;

	/** Cần tìm trong DB: label name -> lấy id gán vào releases.labelId */
	label?: string;

	/** Dùng trực tiếp: lưu vào releases.cLineYear */
	cLineYear?: number;

	/** Dùng trực tiếp: lưu vào releases.cLineOwner */
	cLineOwner?: string;

	/** Dùng trực tiếp: lưu vào releases.pLineYear */
	pLineYear?: number;

	/** Dùng trực tiếp: lưu vào releases.pLineOwner */
	pLineOwner?: string;

	/** Dùng trực tiếp: lưu vào releases.catalogId */
	catalogId?: string;

	/** Dùng trực tiếp: lưu vào releases.isVariousArtist */
	isVariousArtist?: boolean;

	/** Dùng trực tiếp: lưu vào releases.status, nhưng nên validate enum trước */
	status?: string;

	/** Dùng trực tiếp: lưu vào releases.releaseTimeMode, nhưng nên validate enum trước */
	releaseTimeMode?: string;

	/** Cần tìm trong DB: timezone -> lấy id gán vào releases.releaseTimezoneId */
	releaseTimezoneId?: string;

	/** Dùng trực tiếp: lưu vào releases.releaseDate */
	releaseDate?: string;

	/** Dùng trực tiếp: lưu vào releases.releaseTime */
	releaseTime?: string;

	/** Qua bảng phụ: lookup language rồi lưu vào release_language.audioLanguageId */
	audioLanguage?: string;

	/** Qua bảng phụ: lookup language rồi lưu vào release_language.metadataLanguageId */
	metadataLanguage?: string;

	/** Qua bảng phụ: lookup country rồi lưu vào release_language.metadataLanguageCountryId */
	metadataLanguageCountry?: string;

	/** Qua bảng phụ: lưu vào release_territory.distributeWorldwide */
	distributeWorldwide?: boolean;

	/** Qua bảng phụ: lưu vào release_territory.distributionType */
	distributionType?: string;

	/** Qua bảng phụ: lookup country rồi lưu vào release_territory.selectedCountries */
	selectedCountries?: string[];

	/** Dùng trực tiếp: lưu vào releases.tenantId */
	tenantId?: string;

	/** Dùng trực tiếp: lưu vào releases.metadataCi */
	metadataCi?: string;

	/** Dùng trực tiếp: lưu vào releases.metadataSpotify */
	metadataSpotify?: string;

	/** Qua bảng phụ: build dữ liệu để insert release_cover_arts */
	thumbnail?: {
		width: number;
		height: number;
	};

	/** Qua bảng phụ: build dữ liệu để insert tracks và các bảng liên quan của track */
	tracks?: TrackRawSftp[];
}

export interface TrackRawSftp {
	/** Dùng trực tiếp: id track */
	id?: string;

	/** Dùng trực tiếp: lưu vào tracks.title */
	title?: string;

	/** Dùng trực tiếp: lưu vào tracks.version */
	version?: string;

	/** Dùng trực tiếp: lưu vào tracks.isrc */
	isrc?: string;

	/** Dùng trực tiếp: lưu vào tracks.iswc */
	iswc?: string;

	/** Cần tìm trong DB: genre name -> lấy id gán vào tracks.primaryGenreId */
	primaryGenre?: string;

	/** Cần tìm trong DB: genre name -> lấy id gán vào tracks.subGenreId */
	subGenre?: string;

	/** Cần tìm trong DB: track_type name -> lấy id gán vào tracks.trackTypeId */
	trackType?: string;

	/** Cần tìm trong DB: track_origin_type name -> lấy id gán vào tracks.trackOriginTypeId */
	trackOriginType?: string;

	/** Cần tìm trong DB: track_sensitive name -> lấy id gán vào tracks.trackSensitiveId */
	trackSensitive?: string;

	/** Qua bảng phụ: lookup language rồi lưu vào track_language.audioLanguageId */
	audioLanguage?: string;

	/** Qua bảng phụ: lookup language rồi lưu vào track_language.metadataLanguageId */
	metadataLanguage?: string;

	/** Qua bảng phụ: lookup country rồi lưu vào track_language.metadataLanguageCountryId */
	metadataLanguageCountry?: string;

	/** Qua bảng phụ: lookup country rồi lưu vào track_language.recordingCountryId */
	recordingCountry?: string;

	/** Cần tìm trong DB: price_tier name/code -> lấy id gán vào tracks.priceTierId */
	priceTier?: string;

	/** Dùng trực tiếp: lưu vào tracks.pLineYear */
	pLineYear?: number;

	/** Dùng trực tiếp: lưu vào tracks.pLineOwner */
	pLineOwner?: string;

	/** Dùng trực tiếp: lưu vào tracks.order */
	order?: number;

	/** Qua bảng phụ hoặc bảng audio_file/track_localize tuỳ schema: lưu mốc preview start của track */
	previewStart?: number;

	/** Dùng trực tiếp: lưu vào tracks.isByAi */
	isByAi?: boolean;

	/** Dùng trực tiếp: lưu vào tracks.lyric */
	lyric?: string;

	/** Dùng trực tiếp: lưu vào tracks.copyArtistsFromRelease */
	copyArtistsFromRelease?: boolean;

	/** Dùng trực tiếp: lưu vào tracks.copyContributorsFromRelease */
	copyContributorsFromRelease?: boolean;

	/** Qua bảng phụ: build dữ liệu để insert track_artists */
	trackArtists?: any[];

	/** Qua bảng phụ: build dữ liệu để insert track_contributors */
	trackContributors?: any[];
}
