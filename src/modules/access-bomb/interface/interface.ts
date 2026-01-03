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
	releaseStartDate: string;
	releaseEndDate?: null;
	grid?: null;

	pYear: number | null;
	pHolder: string | null;
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

// all
export interface TrackDetailAll {
	wav: {
		fileId: string;
		isTemp: boolean;
		filename: string;
		externalUrl: string | null;
		lastUpdateDate: string | null;
	} | null;

	flac: {
		fileId: string;
		isTemp: boolean;
		filename: string;
		externalUrl: string | null;
		lastUpdateDate: string | null;
	} | null;

	isrc: string;
	name: string;
	image: any;
	lyrics: any;
	rdioId: string | null;
	appleId: number | null;
	assetId: number;
	bitrate: number;
	catalog: any;
	labelId: number;
	trackId: number;
	version: string | null;
	acrCloud: any;
	artistId: number;
	bitDepth: number;
	channels: number;
	explicit: boolean;
	releases: TrackReleaseAll[];
	labelName: string;
	spotifyId: string | null;
	trackType: number;
	archivedAt: string | null;
	artistName: string;
	copyrightC: string | null;
	copyrightP: string | null;
	discNumber: number | null;
	isIngested: boolean;
	languageId: number;
	releaseIds: number[];
	sampleRate: number;
	totalSales: number;
	copyTrackId: number | null;
	description: string | null;
	priceTierId: number | null;
	trackLength: number;
	artistLocals: any[];
	compositions: any[];
	contributors: any[];
	enterpriseId: number;
	isAudioValid: boolean | null;
	playingCount: number;
	royaltyToken: string | null;
	tracksLocals: any[];
	artistAppleId: string | null;
	fileExtension: string;
	isFullyLocked: boolean;
	isLicensePaid: boolean | null;
	monetizations: TrackMonetizationAll[];
	releaseTracks: TrackReleasePlatformAll[];
	releasesCount: number;
	trackVendorId: number | null;
	clearedForSale: boolean;
	enterpriseName: string;
	artistSpotifyId: string | null;
	trackProperties: number[];
	artistExternalIds: ArtistExternalIdAll[];
	previouslyReleased: boolean;
	composerContentsDTO: ComposerContentAll[];
	previewStartSeconds: number | null;
	primaryMusicStyleId: number | null;
	secondaryMusicStyleId: number | null;
	trackRecordingVersions: TrackRecordingVersionAll[];
	isDolbyAtmosReadOnly: boolean;
	licenseRequestStatus: any;
	distributorStoreGenreIds: number[];
}

export interface TrackReleaseAll {
	upc: number;
	name: string;
	image: {
		fileId: string;
		isTemp: boolean;
		filename: string;
		externalUrl: string | null;
		lastUpdateDate: string | null;
	} | null;
	artist: {
		isni: string | null;
		name: string;
		image: any;
		artistId: number;
		lastName: string | null;
		firstName: string | null;
		archivedAt: string | null;
		middleName: string | null;
		tracksCount: number;
		releasesCount: number;
	};
	assetId: number;
	version: string | null;
	releaseId: number;
	archivedAt: string | null;
	isIngested: boolean;
	releaseDate: string;
	tracksCount: number;
	contributors: any[];
	enterpriseId: number;
	isCompilation: boolean;
	releaseTypeId: number;
	enterpriseName: string;
	isDolbyAtmosReadOnly: boolean;
	isLockedForDistribution: boolean;
}

export interface TrackMonetizationAll {
	optIn: boolean | null;
	isLive: boolean | null;
	isPaid: boolean | null;
	trackId: number;
	policyId: number;
	isEligible: boolean | null;
	transactionId: string | null;
	transactionDate: string | null;
	distributorStoreId: number;
}

export interface TrackReleasePlatformAll {
	rdioId: string | null;
	appleId: number | null;
	deezerId: string | null;
	releaseId: number;
	spotifyId: string | null;
}

export interface ArtistExternalIdAll {
	profileId: string;
	distributorStoreId: number;
}

export interface ComposerContentAll {
	proId: string | null;
	share: number | null;
	roleId: number;
	rightsId: number;
	composerId: number;
	publisherId: number;
	composerName: string;
	contributorId: number;
	publisherName: string;
	composerImageId: string | null;
	composersLocals: any[];
	publisherAdminId: number | null;
	proRegistrationId: string | null;
	publisherAdminName: string | null;
}

export interface TrackRecordingVersionAll {
	isrc: string;
	audioFiles: TrackAudioFileAll[];
	recordingVersionType: number;
}

export interface TrackAudioFileAll {
	audioId: string;
	audioSize: number;
	fileFormat: number;
	audioBitrate: number;
	audioSeconds: number;
	audioBitDepth: number;
	audioChannels: number;
	audioFilename: string;
	audioSampleRate: number;
}

// release
export interface ReleaseDetailAll {
	upc: number;
	isrc: string | null;
	name: string;
	tags: any;
	image: {
		fileId: string;
		isTemp: boolean;
		filename: string;
		externalUrl: string | null;
		lastUpdateDate: string | null;
	} | null;
	artist: any;
	tracks: TrackDetailAll[]; // ← ĐÂY MỚI ĐÚNG! Không phải trackCis
	assetId: number;
	catalog: string | null;
	labelId: number;
	mixedBy: any;
	version: string | null;
	artistId: number;
	createdBy: string;
	labelName: string;
	releaseId: number;
	trackISRC: string | null;
	archivedAt: string | null;
	artistName: string;
	copyrightC: string | null;
	copyrightP: string | null;
	isIngested: boolean;
	languageId: number;
	masteredBy: any;
	notesCount: number;
	payeeOwner: number;
	producedBy: any;
	totalSales: number;
	description: string | null;
	releaseDate: string;
	tracksCount: number;
	approvedDate: string | null;
	artistLocals: any[];
	contributors: any[];
	creationDate: string;
	enterpriseId: number;
	masteredDate: any;
	artistAppleId: string | null;
	artistImageId: string;
	isCompilation: boolean;
	isFullyLocked: boolean;
	kountStatusId: any;
	recordingDate: any;
	releaseTypeId: number;
	createdByEmail: string;
	enterpriseName: string;
	hasRecordLabel: boolean;
	releasesLocals: any[];
	artistSpotifyId: string | null;
	createdByUserId: string;
	enterpriseEmail: string;
	isEnterpriseVip: boolean;
	kountStatusName: any;
	payeeNotesCount: number;
	descriptionTitle: string | null;
	parentalAdvisory: boolean;
	artistExternalIds: ArtistExternalIdAll[];
	enterpriseImageId: string;
	enterpriseOwnerId: string;
	payeeReferrerName: any;
	productionCredits: any;
	recordingLocation: any;
	featureFmSmartLink: any;
	previouslyReleased: boolean;
	primaryMusicStyleId: number | null;
	isDolbyAtmosReadOnly: boolean;
	lastPayeePaymentDate: string | null;
	secondaryMusicStyleId: number | null;
	lastPayeePaymentAmount: number | null;
	trackRecordingVersions: TrackRecordingVersionAll[];
	isEnterpriseWhiteListed: boolean;
	isLockedForDistribution: boolean;
	distributorStoreGenreIds: number[];
}
