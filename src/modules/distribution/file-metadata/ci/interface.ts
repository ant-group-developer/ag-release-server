export interface CiRawRow {
	checkNo?: 1;
	groupingId?: null;

	releaseTitle: string;
	versionDescription?: string | null;
	artist: string;
	displayArtist?: string | null;
	gtin: string;
	catalogueNo?: string | null;
	releaseFormatType: string;
	soundCarrier?: null;
	priceBand?: string | null;

	licensedTerritoriesInclude: string;
	licensedTerritoriesExclude?: string | null;
	releaseStartDate: string | null;
	releaseEndDate?: null;
	grid?: null;

	pYear: number;
	pHolder: string;
	cYear: number | null;
	cHolder: string | null;

	status?: null;
	label: string;

	mainGenre: string;
	mainSubGenre?: null;
	alternateGenre?: string | null;
	alternateSubGenre?: null;
	explicitContent: 'Y' | 'N';

	volumeNo: 1; // 1
	volumeTotal: 1; // 1
	services: null;

	// track
	trackNo: number;
	trackTitle: string;
	trackVersion?: string | null;
	trackArtist: string;
	trackDisplayArtist?: string | null;
	isrc: string;
	trackGrid?: null;
	availableSeparately: string;

	trackPYear?: number;
	trackPHolder?: string;

	trackMainGenre?: string | null;
	trackMainSubGenre?: string | null;
	trackAlternateGenre?: string | null;
	trackAlternateSubGenre?: string | null;
	trackExplicitContent?: string | null;

	producers?: string;
	mixers?: string;
	composers?: string;
	lyricists?: string | null;
	publishers?: string | null;

	hasInstruments?: string | null;
	hasVocalsOrLanguage?: string | null;
	previewStartTime?: number | null;
	originalReleaseDate?: string | Date | null;
}

export const CI_COLUMN_MAP: Record<keyof CiRawRow, string> = {
	checkNo: 'A',
	groupingId: 'B',
	releaseTitle: 'C',
	versionDescription: 'D',
	artist: 'E',
	displayArtist: 'F',
	gtin: 'G',
	catalogueNo: 'H',
	releaseFormatType: 'I',
	soundCarrier: 'J',
	priceBand: 'K',
	licensedTerritoriesInclude: 'L',
	licensedTerritoriesExclude: 'M',
	releaseStartDate: 'N',
	releaseEndDate: 'O',
	grid: 'P',
	pYear: 'Q',
	pHolder: 'R',
	cYear: 'S',
	cHolder: 'T',
	status: 'U',
	label: 'V',
	mainGenre: 'W',
	mainSubGenre: 'X',
	alternateGenre: 'Y',
	alternateSubGenre: 'Z',
	explicitContent: 'AA',
	volumeNo: 'AB',
	volumeTotal: 'AC',
	services: 'AD',

	// ===== TRACK BASIC =====
	trackNo: 'AE',
	trackTitle: 'AF',
	trackVersion: 'AG',
	trackArtist: 'AH',
	trackDisplayArtist: 'AI',
	isrc: 'AJ',
	trackGrid: 'AK',
	availableSeparately: 'AL',

	// ===== (P) & (C) =====
	trackPYear: 'AM', // (P) YEAR
	trackPHolder: 'AN', // (P) HOLDER
	// (C) YEAR & (C) HOLDER: KHÔNG REQUIRED Ở TRACK → BỎ

	// ===== GENRES =====
	trackMainGenre: 'AQ', // Main Genre (drop-down)
	trackMainSubGenre: 'AR', // Main SubGenre (free text)
	trackAlternateGenre: 'AS', // Alternate Genre (drop-down)
	trackAlternateSubGenre: 'AT', // Alternate SubGenre (free text)

	// ===== EXPLICIT CONTENT =====
	trackExplicitContent: 'AU', // Explicit Content (select)

	// ===== SOUND RECORDING CONTRIBUTORS =====
	producers: 'AV', // Producer(s)
	mixers: 'AW', // Mixer(s)

	// ===== MUSICAL WORK CONTRIBUTORS =====
	composers: 'AX', // Composer(s)
	lyricists: 'AY', // Lyricist(s)
	publishers: 'AZ', // Publisher(s)

	// ===== PERFORMANCE =====
	hasInstruments: 'BA', // Has Instruments? (drop-down)
	hasVocalsOrLanguage: 'BB', // Has Vocals/Language? (drop-down)
	previewStartTime: 'BC', // Preview Start Time (seconds)
	originalReleaseDate: 'BD', // Original Release Date (DD/MM/YYYY or YYYY/MM/DD)
};
