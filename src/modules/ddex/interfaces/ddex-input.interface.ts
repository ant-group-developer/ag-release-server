/**
 * DDEX ERN Input Interfaces (supports ERN 4.3 and ERN 3.8.2)
 * Independent module - no database dependencies
 * Reference: http://ddex.net/xml/ern/43/release-notification.xsd
 * Reference: http://ddex.net/xml/ern/382/release-notification.xsd
 */

type LiteralUnion<T extends U, U = string> = T | (U & Record<never, never>);

// ============================================================================
// VERSION
// ============================================================================
import { ErnVersion } from '../../ern/interfaces/ern-input.interface';
export type DDEXVersion = ErnVersion;

// ============================================================================
// ALLOWED VALUE TYPES (from avs:AllowedValueSets)
// Using union types with string fallback for flexibility
// ============================================================================

/** Sound Recording Type (avs:SoundRecordingType) */
export type DDEXSoundRecordingType =
	| 'MusicalWorkSoundRecording'
	| 'NonMusicalWorkSoundRecording'
	| 'SpokenWordSoundRecording'
	| 'Unknown'
	| (string & {});

/** Sound Recording Edition Type (avs:SoundRecordingEditionType) */
export type DDEXSoundRecordingEditionType =
	| 'NonImmersiveEdition'
	| 'ImmersiveEdition'
	| 'Unknown'
	| (string & {});

/** Recording Mode (avs:RecordingMode) */
export type DDEXRecordingMode =
	| 'Mono'
	| 'Stereo'
	| 'Surround'
	| 'Binaural'
	| 'Unknown'
	| (string & {});

/** Image Type (avs:ImageType) */
export type DDEXImageType =
	| 'FrontCoverImage'
	| 'BackCoverImage'
	| 'BookletFrontImage'
	| 'BookletBackImage'
	| 'Poster'
	| 'Icon'
	| 'Logo'
	| 'Unknown'
	| (string & {});

/** Image Codec Type (avs:ImageCodecType) */
export type DDEXImageCodecType =
	| 'JPEG'
	| 'PNG'
	| 'GIF'
	| 'TIFF'
	| (string & {});

/** Parental Warning Type (avs:ParentalWarningType) */
export type DDEXParentalWarningType =
	| 'Explicit'
	| 'NotExplicit'
	| 'ExplicitContentEdited'
	| 'NoAdviceAvailable'
	| 'Unknown'
	| (string & {});

/** Release Type (avs:ReleaseType) */
export type DDEXReleaseType =
	| 'Album'
	| 'Single'
	| 'EP'
	| 'Bundle'
	| 'MaxiSingle'
	| 'Unknown'
	| (string & {});

/** Display Artist Role (avs:DisplayArtistRole) */
export type DDEXDisplayArtistRole =
	| 'MainArtist'
	| 'FeaturedArtist'
	| 'Actor'
	| 'Narrator'
	| 'Unknown'
	| (string & {});

/** Contributor Role (avs:ContributorRole) */
export type DDEXContributorRole =
	| 'Composer'
	| 'ComposerLyricist'
	| 'Lyricist'
	| 'Producer'
	| 'Arranger'
	| 'MixingEngineer'
	| 'MasteringEngineer'
	| 'Remixer'
	| 'Unknown'
	| (string & {});

/** Commercial Model Type (avs:CommercialModelType) */
export type DDEXCommercialModelType =
	| 'SubscriptionModel'
	| 'AdvertisementSupportedModel'
	| 'PayAsYouGoModel'
	| 'FreeOfChargeModel'
	| 'Unknown'
	| (string & {});

/** Use Type (avs:UseType) */
export type DDEXUseType =
	| 'ConditionalDownload'
	| 'Stream'
	| 'OnDemandStream'
	| 'PermanentDownload'
	| 'NonInteractiveStream'
	| 'Unknown'
	| (string & {});

/** Update Indicator Type (for ERN 3.8.2) */
export type DDEXUpdateIndicator = 'OriginalMessage' | 'UpdateMessage';

/** Message Control Type (for ERN 3.8.2) */
export type DDEXMessageControlType = 'LiveMessage' | 'TestMessage';

/** Audio Codec Type (avs:AudioCodecType) */
export type DDEXAudioCodecType =
	| 'AAC'
	| 'FLAC'
	| 'MP3'
	| 'PCM'
	| 'WAV'
	| 'Unknown'
	| (string & {});

// ============================================================================
// MAIN INPUT STRUCTURE
// ============================================================================

export interface DDEXGenerateInput {
	version: DDEXVersion;
	data: DDEXData;
}

export interface DDEXData {
	messageHeader: DDEXMessageHeader;
	parties: DDEXParty[];
	resources: DDEXResource[];
	releases: DDEXRelease[];
	deals: DDEXDeal[];
	// === ERN 3.8.2 specific ===
	/** Update indicator: OriginalMessage (add) or UpdateMessage (update/takedown) */
	updateIndicator?: DDEXUpdateIndicator;
}

// ============================================================================
// MESSAGE HEADER (ern:MessageHeader)
// ============================================================================

export interface DDEXMessageHeader {
	/** Message thread ID for grouping related messages. Default: "Baseline" */
	messageThreadId?: string;
	/** Unique message identifier, e.g., "00001" */
	messageId: string;
	/** Message sender information */
	sender: DDEXMessagingParty;
	/** Message recipient information */
	recipient: DDEXMessagingParty;
	/** ISO 8601 datetime. Auto-generated if not provided */
	createdDateTime?: string;
	// === ERN 3.8.2 specific ===
	/** XML filename, e.g. "4061707105869.xml" */
	messageFileName?: string;
	/** Message control type: LiveMessage or TestMessage */
	messageControlType?: DDEXMessageControlType;
}

export interface DDEXMessagingParty {
	/** DDEX Party ID (DPID), e.g., "PADPIDA20250804056" */
	partyId: string;
	/** Party name */
	partyName: string;
	// === ERN 3.8.2 specific ===
	/** Whether partyId is a DPID (adds IsDPID="true" attribute) */
	isDPID?: boolean;
}

// ============================================================================
// PARTY (ern:Party)
// ============================================================================

export interface DDEXParty {
	/** Party reference, pattern: P[\d\-_a-zA-Z]+, e.g., "P1", "P2" */
	reference: string;
	/** Full party name */
	name: string;
	/** Optional proprietary party ID (e.g., Spotify artist ID) */
	partyId?: DDEXProprietaryId;
	// === Optional XSD fields ===
	/** Party name with territory-specific variants */
	partyNames?: DDEXPartyName[];
	/** Related parties (e.g., group members) */
	relatedParties?: DDEXRelatedParty[];
	/** ISNI (International Standard Name Identifier) */
	isni?: string;
}

export interface DDEXProprietaryId {
	/** Namespace for the ID, e.g., "PADPIDA2011072101T" */
	namespace: string;
	/** The ID value, e.g., "spotify:artist:34nZgjuSy4ogN8SS1tC67n" */
	value: string;
}

export interface DDEXPartyName {
	/** Full name of the party */
	fullName: string;
	/** ASCII transcribed version of the name */
	fullNameAsciiTranscribed?: string;
	/** Indexed version (Last, First) */
	fullNameIndexed?: string;
	/** First/given names */
	namesBeforeKeyName?: string;
	/** Last/family name */
	keyName?: string;
	/** Suffix names */
	namesAfterKeyName?: string;
	/** Abbreviated name for small displays */
	abbreviatedName?: string;
	/** Territory this name applies to */
	applicableTerritoryCode?: string;
	/** Language and script code (IETF RFC 5646) */
	languageAndScriptCode?: string;
	/** Whether this is the default name */
	isDefault?: boolean;
}

export interface DDEXRelatedParty {
	/** Reference to another party */
	partyReference: string;
	/** Relationship type */
	relationshipType?: string;
}

// ============================================================================
// RESOURCE (ern:ResourceList)
// ============================================================================

export type DDEXResourceType = 'SoundRecording' | 'Image' | 'Text';

export interface DDEXResource {
	/** Resource reference, pattern: A[\d\-_a-zA-Z]+, e.g., "A1", "A2" */
	reference: string;
	/** Type of resource */
	type: DDEXResourceType;

	// === Sound Recording specific ===
	/** ISRC code */
	isrc?: string;
	/** Track title */
	title?: string;
	/** Display artist name string */
	displayArtistName?: string;
	/** Display artists with roles */
	displayArtists?: DDEXDisplayArtist[];
	/** Contributors (composers, producers, etc.) */
	contributors?: DDEXContributor[];
	/** ISO 8601 duration, e.g., "PT0H3M16S" */
	duration?: string;
	/** P-Line copyright */
	pLine?: DDEXCopyrightLine;
	/** Technical details for delivery */
	technicalDetails?: DDEXTechnicalDetails;

	// === Sound Recording optional XSD fields ===
	/** Sound recording type (default: MusicalWorkSoundRecording) */
	soundRecordingType?: DDEXSoundRecordingType;
	/** Edition type (default: NonImmersiveEdition) */
	editionType?: DDEXSoundRecordingEditionType;
	/** Recording mode (default: Stereo) */
	recordingMode?: DDEXRecordingMode;
	/** Language of the vocal performance */
	languageOfPerformance?: string;
	/** Whether this is Hi-Res Music certified */
	isHiResMusic?: boolean;
	/** Disable crossfade in playback */
	disableCrossfade?: boolean;
	/** Exclude from search results */
	disableSearch?: boolean;

	// === Image specific ===
	/** Image type (FrontCoverImage, BackCoverImage, etc.) */
	imageType?: DDEXImageType;
	/** C-Line copyright for images */
	cLine?: DDEXCopyrightLine;
	/** Image codec type (ERN 3.8.2) */
	imageCodecType?: DDEXImageCodecType;
	/** Image height in pixels (ERN 3.8.2) */
	imageHeight?: number;
	/** Image width in pixels (ERN 3.8.2) */
	imageWidth?: number;

	// === Text / Lyrics specific (ERN 3.8.2) ===
	/** Text type, e.g., 'LyricText' */
	textType?: string;

	// === Common ===
	/** Parental warning type (default: NotExplicit) */
	parentalWarningType?: DDEXParentalWarningType;
	/** Territory code this resource applies to */
	applicableTerritoryCode?: string;
	/** Whether this is artist-related (ERN 3.8.2), default: false */
	isArtistRelated?: boolean;
	/** SubTitle for the resource (ERN 3.8.2) */
	subTitle?: string;

	// === ERN 3.8.2 inline contributors (no PartyList) ===
	/** Resource contributors with inline party names */
	resourceContributors?: DDEXResourceContributor[];
	/** Indirect resource contributors (Lyricist, Composer, etc.) */
	indirectResourceContributors?: DDEXIndirectResourceContributor[];
	/** Genre (for territory-specific details in ERN 3.8.2) */
	genre?: string;
	/** Sub-genre */
	subGenre?: string;
	/** Sequence number within the release */
	sequenceNumber?: number;
	/** Additional territory codes */
	territoryCodes?: string[];
}

export interface DDEXDisplayArtist {
	/** Reference to party (P1, P2, etc.) */
	partyRef: string;
	/** Artist role (MainArtist, FeaturedArtist, etc.) */
	role: LiteralUnion<DDEXDisplayArtistRole, string>;
	/** Display sequence (1-based) */
	sequenceNumber: number;
	// === Optional XSD fields ===
	/** Artistic name to display */
	artisticName?: string;
	/** Territory this applies to */
	applicableTerritoryCode?: string;
}

export interface DDEXContributor {
	/** Reference to party (P1, P2, etc.) */
	partyRef: string;
	/** Contributor role (Composer, Lyricist, Producer, etc.) */
	role: LiteralUnion<DDEXContributorRole, string>;
	/** Display sequence (1-based) */
	sequenceNumber: number;
	// === Optional XSD fields ===
	/** Instrument played */
	instrumentType?: string;
}

/** Resource Contributor (ERN 3.8.2 - inline party name, no party reference) */
export interface DDEXResourceContributor {
	/** Full name of the contributor */
	fullName: string;
	/** Contributor role (MainArtist, etc.) */
	role: string;
	/** Sequence number (1-based) */
	sequenceNumber: number;
	/** Language and script code for the name */
	languageAndScriptCode?: string;
}

/** Indirect Resource Contributor (ERN 3.8.2 - Lyricist, Composer, Producer, etc.) */
export interface DDEXIndirectResourceContributor {
	/** Full name of the contributor */
	fullName: string;
	/** Contributor role (Lyricist, Composer, or UserDefined) */
	role: string;
	/** User-defined value when role is 'UserDefined' */
	userDefinedValue?: string;
	/** Language and script code for the name */
	languageAndScriptCode?: string;
}

export interface DDEXCopyrightLine {
	/** Copyright year */
	year: number;
	/** Copyright text, e.g., "2025 ANT MUSIC LLC" */
	text: string;
}

export interface DDEXTechnicalDetails {
	/** Technical resource reference, pattern: T[\d\-_a-zA-Z]+, e.g., "T1S" */
	reference: string;
	/** File URI, e.g., "resources/QT6KL2500010_T1S.wav" */
	fileUri: string;
	/** Whether file is provided in delivery (default: true) */
	isProvidedInDelivery?: boolean;
	// === Optional XSD fields ===
	/** Audio codec type */
	audioCodecType?: DDEXAudioCodecType;
	/** Bit rate in kbps */
	bitRate?: number;
	/** Sampling rate in Hz */
	samplingRate?: number;
	/** Number of audio channels */
	numberOfChannels?: string;
	/** Bit depth (e.g., 16, 24) */
	bitsPerSample?: number;
	/** Hash value for file integrity */
	hashSum?: string;
	/** Hash algorithm used */
	hashSumAlgorithmType?: string;
	// === ERN 3.8.2 specific ===
	/** File name (e.g., "DEAR41867226.mp3") */
	fileName?: string;
	/** File path (e.g., "resources/") */
	filePath?: string;
}

// ============================================================================
// RELEASE (ern:ReleaseList)
// ============================================================================

export interface DDEXRelease {
	/** Release reference, R0 for main release, R1+ for track releases */
	reference: string;
	/** Release type (Album, Single, EP, TrackRelease, etc.) */
	type: LiteralUnion<DDEXReleaseType, string>;
	/** ICPN (UPC/EAN), e.g., "850080651018" */
	icpn: string;
	/** Release title */
	title: string;
	/** Display artist name string */
	displayArtistName: string;
	/** Display artists with roles */
	displayArtists: DDEXDisplayArtist[];
	/** Reference to label party (e.g., "P2") or label name directly */
	labelRef: string;
	/** P-Line copyright */
	pLine?: DDEXCopyrightLine;
	/** C-Line copyright */
	cLine?: DDEXCopyrightLine;
	/** Genre text */
	genre: string;
	/** Original release date (YYYY-MM-DD) */
	releaseDate: string;
	/** Resource references included in this release */
	resourceRefs: string[];
	/** Cover art resource reference */
	coverArtRef?: string;
	/** Parental warning type */
	parentalWarningType?: DDEXParentalWarningType;

	// === Optional XSD fields ===
	/** Sub-title */
	subTitle?: string;
	/** GRid (Global Release Identifier) */
	grid?: string;
	/** Catalog number */
	catalogNumber?: string;
	/** Sub-genre text */
	subGenre?: string;
	/** Keywords for discoverability */
	keywords?: string[];
	/** Release description/synopsis */
	synopsis?: string;
	/** Territory code this release applies to */
	applicableTerritoryCode?: string;
	/** Is this the main release? */
	isMainRelease?: boolean;

	// === ERN 3.8.2 specific ===
	/** Whether ICPN is an EAN (adds IsEan attribute) */
	isEan?: boolean;
	/** ISRC for track releases (ERN 3.8.2 uses ISRC instead of ICPN for track releases) */
	isrc?: string;
	/** Label name (direct string, used in ERN 3.8.2 instead of label party ref) */
	labelName?: string;
	/** Territory codes for ReleaseDetailsByTerritory */
	territoryCodes?: string[];
	/** Linked release resource references (e.g., lyrics ref) */
	linkedResourceRefs?: DDEXLinkedResourceRef[];
}

/** Linked resource reference with description (ERN 3.8.2) */
export interface DDEXLinkedResourceRef {
	/** Resource reference (e.g., "A2") */
	ref: string;
	/** Link description (e.g., "Lyrics") */
	linkDescription?: string;
}

/** Track Release (for individual track releases within an album) */
export interface DDEXTrackRelease {
	/** Release reference (R1, R2, R3...) */
	reference: string;
	/** Resource reference (A1, A2...) */
	resourceRef: string;
	/** Reference to label party */
	labelRef: string;
	/** Genre text */
	genre: string;
}

// ============================================================================
// DEAL (ern:DealList)
// ============================================================================

export interface DDEXDeal {
	/** Release reference this deal applies to (R0, R1, R2...) */
	releaseRef: string;
	/** Territory codes (ISO 3166 or "Worldwide") */
	territories: string[];
	/** Deal start datetime (ISO 8601) */
	validityStartDateTime: string;
	/** Commercial model types (SubscriptionModel, etc.) */
	commercialModelTypes: LiteralUnion<DDEXCommercialModelType, string>[];
	/** Use types (ConditionalDownload, Stream, etc.) */
	useTypes: LiteralUnion<DDEXUseType, string>[];
	/** Technical resource reference for track deals */
	technicalResourceRef?: string;

	// === Optional XSD fields ===
	/** Deal end datetime (ISO 8601) */
	validityEndDateTime?: string;
	/** Price information */
	priceInformation?: DDEXPriceInformation;
	/** Is this deal exclusive? */
	isExclusive?: boolean;
	/** Pre-order date */
	preOrderReleaseDate?: string;

	// === ERN 3.8.2 specific ===
	/** Whether this is a takedown deal */
	takeDown?: boolean;
}

export interface DDEXPriceInformation {
	/** Price type */
	priceType?: string;
	/** Wholesale price */
	wholesalePricePerUnit?: number;
	/** Suggested retail price */
	suggestedRetailPrice?: number;
	/** Currency code (ISO 4217) */
	currencyCode?: string;
}

// ============================================================================
// VISIBILITY (ern:ReleaseVisibility, ern:TrackReleaseVisibility)
// ============================================================================

export interface DDEXVisibility {
	/** Visibility reference (V0, V1...) */
	reference: string;
	/** Territory code */
	territory: string;
	/** When release info can be displayed */
	releaseDisplayStartDateTime?: string;
	/** When cover art can be displayed */
	coverArtPreviewStartDateTime?: string;
	/** When full track listing can be displayed */
	fullTrackListingPreviewStartDateTime?: string;
	/** For track releases: when track listing can be displayed */
	trackListingPreviewStartDateTime?: string;
	/** When audio/video clip previews can be played */
	clipPreviewStartDateTime?: string;
}
