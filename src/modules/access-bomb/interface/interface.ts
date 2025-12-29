export interface CiRawRow {
	checkNo?: 1;
	groupingId?: null;

	releaseTitle: string;
	versionDescription?: string | null;
	artist: string;
	displayArtist?: null;
	gtin: string;
	catalogueNo?: string | null;
	releaseFormatType: string;
	soundCarrier?: null;
	priceBand?: string | null;

	licensedTerritoriesInclude: string;
	licensedTerritoriesExclude?: null;
	releaseStartDate: string | Date;
	releaseEndDate?: null;
	grid?: null;

	pYear: number;
	pHolder: string;
	cYear: number;
	cHolder: string;

	status?: null;
	label: string;

	mainGenre: string;
	mainSubGenre?: null;
	alternateGenre?: string | null;
	alternateSubGenre?: null;
	explicitContent: 'N';

	volumeNo: 1; // 1
	volumeTotal: 1; // 1

	// track
	trackNo: number;
	trackTitle: string;
	trackVersion?: string | null;
	trackArtist: string;
	trackDisplayArtist?: string | null;
	isrc: string;
	trackGrid?: null;
	availableSeparately: string;

	trackPYear?: number | null;
	trackPHolder?: string | null;

	trackMainGenre?: string | null;
	trackMainSubGenre?: string | null;
	trackAlternateGenre?: string | null;
	trackAlternateSubGenre?: string | null;
	trackExplicitContent?: string | null;

	producers?: string | null;
	mixers?: string | null;
	composers?: string | null;
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
	trackNo: 'AE',
	trackTitle: 'AF',
	trackVersion: 'AG',
	trackArtist: 'AH',
	trackDisplayArtist: 'AI',
	isrc: 'AJ',
	trackGrid: 'AK',
	availableSeparately: 'AL',
	trackPYear: 'AM',
	trackPHolder: 'AN',
	trackMainGenre: 'AO',
	trackMainSubGenre: 'AP',
	trackAlternateGenre: 'AQ',
	trackAlternateSubGenre: 'AR',
	trackExplicitContent: 'AS',
	producers: 'AT',
	mixers: 'AU',
	composers: 'AV',
	lyricists: 'AW',
	publishers: 'AX',
	hasInstruments: 'AY',
	hasVocalsOrLanguage: 'AZ',
	previewStartTime: 'BA',
	originalReleaseDate: 'BB',
};
