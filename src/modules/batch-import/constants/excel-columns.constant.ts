/**
 * Centralized Excel column name constants.
 * If the Excel template changes column headers, update ONLY this file.
 */
export const EXCEL_COLUMNS = {
	// ─── Release-Level ───────────────────────────────────────────────
	UPC: 'UPC',
	RELEASE_TITLE: 'Release Title',
	RELEASE_SUBTITLE: 'Release Subtitle',
	RELEASE_TYPE: 'Release Type',
	GENRE: 'Genre',
	LABEL: 'Label',
	CATALOG_NUMBER: 'Catalog Number',
	C_LINE: 'C Line',
	RELEASE_DATE: 'Release Date',
	ORIGINAL_RELEASE_DATE: 'Original Release Date',
	TERRITORY_AVAILABILITY: 'Territory-Availability',
	RELEASE_MAIN_ARTIST: 'Release Main Artist',
	SECONDARY_RELEASE_MAIN_ARTIST: 'Secondary Release Main Artist',
	RELEASE_FEATURED_ARTIST: 'Release Featured Artist',
	SECONDARY_RELEASE_FEATURED_ARTIST: 'Secondary Release Featured Artist',
	PUBLISHER: 'Publisher',

	// ─── Track-Level ─────────────────────────────────────────────────
	TRACK_TITLE: 'Track Title',
	TRACK_SUBTITLE: 'Track SubTitle',
	SECONDARY_LANGUAGE_TRACK_TITLE: 'Secondary-Language-Track-Title',
	SECONDARY_LANGUAGE_TRACK_SUBTITLE: 'Secondary-Language-Track-SubTitle',
	ISRC: 'ISRC',
	TRACK_NUMBER: 'Track-Number',
	TRACK_RELEASE_ID: 'Track-Release-Id',
	P_LINE: 'P-Line',
	PARENTAL_WARNING: 'Parental Warning',
	METADATA_LANGUAGE: 'Metadata language',
	METADATA_LANGUAGE_COUNTRY: 'Metadata language country',
	AUDIO_LANGUAGE: 'Audio language',
	TRACK_MAIN_ARTIST: 'Track Main Artist',
	SECONDARY_LANGUAGE_TRACK_MAIN_ARTIST:
		'Secondary-Language-Track-Main-Artist',
	TRACK_LENGTH: 'Track-Length',
	TRACK_SAMPLE_LENGTH: 'Track Sample length',
	TRACK_HOOK: 'Track Hook',

	// ─── Contributor Columns (Track-Level) ───────────────────────────
	TRACK_FEATURED_ARTIST: 'Track-Featured-Artist',
	SECONDARY_LANGUAGE_TRACK_FEATURED_ARTIST:
		'Secondary-Language-Track-Featured-Artist',
	COMPOSER: 'Composer',
	LYRICIST: 'Lyricist',
	MUSIC_PRODUCER: 'Producer',
	REMIXER: 'Remixer',
	ARRANGER: 'Arranger',
	ACTOR: 'Actor',
	PLAYBACK_SINGER: 'Playback-Singer',
	FILM_DIRECTOR: 'Film-Director',
	MUSIC_DIRECTOR: 'Music-Director',
	CONDUCTOR: 'Conductor',
	SOLOIST: 'Soloist',
	ORCHESTRA: 'Orchestra',

	// ─── Pricing & Streaming ─────────────────────────────────────────
	DOWNLOAD_PURCHASE: 'Download-Purchase',
	SUBSCRIPTION_STREAMING: 'Subscription-Streaming',
	AD_SUPPORTED_STREAMING: 'Ad-Supported-Streaming',
	ALBUM_SRP: 'Album-SRP',
	ALBUM_SRP_CURRENCY: 'Album-SRP-Currency',
	TRACK_SRP: 'Track-SRP',
	TRACK_SRP_CURRENCY: 'Track-SRP-Currency',
} as const;

/** Track-level contributor columns (each maps to an artist_roles.code) */
export const CONTRIBUTOR_ROLE_COLUMNS = [
	EXCEL_COLUMNS.TRACK_FEATURED_ARTIST,
	EXCEL_COLUMNS.COMPOSER,
	EXCEL_COLUMNS.LYRICIST,
	EXCEL_COLUMNS.MUSIC_PRODUCER,
	EXCEL_COLUMNS.REMIXER,
	EXCEL_COLUMNS.ARRANGER,
	EXCEL_COLUMNS.ACTOR,
	EXCEL_COLUMNS.PLAYBACK_SINGER,
	EXCEL_COLUMNS.FILM_DIRECTOR,
	EXCEL_COLUMNS.MUSIC_DIRECTOR,
	EXCEL_COLUMNS.CONDUCTOR,
	EXCEL_COLUMNS.SOLOIST,
	EXCEL_COLUMNS.ORCHESTRA,
] as const;

/** Release-level contributor columns */
export const RELEASE_CONTRIBUTOR_COLUMNS = [
	EXCEL_COLUMNS.RELEASE_FEATURED_ARTIST,
] as const;

/** Column name → artist_roles.code mapping */
export const COLUMN_TO_ROLE_CODE: Record<string, string> = {
	[EXCEL_COLUMNS.RELEASE_FEATURED_ARTIST]: 'Featured Artist',
	[EXCEL_COLUMNS.TRACK_FEATURED_ARTIST]: 'Featured Artist',
	[EXCEL_COLUMNS.COMPOSER]: 'Composer',
	[EXCEL_COLUMNS.LYRICIST]: 'Lyricist',
	[EXCEL_COLUMNS.MUSIC_PRODUCER]: 'Producer',
	[EXCEL_COLUMNS.REMIXER]: 'Remixer',
	[EXCEL_COLUMNS.ARRANGER]: 'Arranger',
	[EXCEL_COLUMNS.ACTOR]: 'Actor',
	[EXCEL_COLUMNS.PLAYBACK_SINGER]: 'Playback Singer',
	[EXCEL_COLUMNS.FILM_DIRECTOR]: 'Film Director',
	[EXCEL_COLUMNS.MUSIC_DIRECTOR]: 'Music Director',
	[EXCEL_COLUMNS.CONDUCTOR]: 'Conductor',
	[EXCEL_COLUMNS.SOLOIST]: 'Soloist',
	[EXCEL_COLUMNS.ORCHESTRA]: 'Orchestra',
};
