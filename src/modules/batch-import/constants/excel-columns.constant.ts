/**
 * Centralized Excel column name constants.
 * If the Excel template changes column headers, update ONLY this file.
 */
export const EXCEL_COLUMNS = {
	// ─── Release-Level ───────────────────────────────────────────────
	UPC: 'UPC',
	ALBUM_TITLE: 'Album-Title',
	ALBUM_SUBTITLE: 'Album-SubTitle',
	RELEASE_TYPE: 'Release-Type',
	GENRE: 'Genre',
	LABEL: 'Label',
	CATALOG_NUMBER: 'Catalog-Number',
	C_LINE: 'C-Line',
	RELEASE_DATE: 'Release-Date',
	RELEASE_DATE_TIME: 'Release-Date-Time',
	TERRITORY_AVAILABILITY: 'Territory-Availability',
	ALBUM_MAIN_ARTIST: 'Album-Main-Artist',
	ALBUM_FEATURED_ARTIST: 'Album-Featured-Artist',
	PUBLISHER: 'Publisher',

	// ─── Track-Level ─────────────────────────────────────────────────
	TRACK_TITLE: 'Track-Title',
	TRACK_SUBTITLE: 'Track-SubTitle',
	ISRC: 'ISRC',
	ISWC: 'ISWC',
	TRACK_NUMBER: 'Track-Number',
	P_LINE: 'P-Line',
	PARENTAL_WARNING: 'Parental-Warning',
	LANGUAGE_OF_PERFORMANCE: 'Language-Of-Performance',
	TRACK_MAIN_ARTIST: 'Track-Main-Artist',
	TRACK_LENGTH: 'Track-Length',

	// ─── Contributor Columns (Track-Level) ───────────────────────────
	TRACK_FEATURED_ARTIST: 'Track-Featured-Artist',
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
	EXCEL_COLUMNS.ALBUM_FEATURED_ARTIST,
] as const;

/** Column name → artist_roles.code mapping */
export const COLUMN_TO_ROLE_CODE: Record<string, string> = {
	[EXCEL_COLUMNS.ALBUM_FEATURED_ARTIST]: 'Featured Artist',
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
