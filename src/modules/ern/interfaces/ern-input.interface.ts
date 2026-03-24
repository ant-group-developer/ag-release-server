/**
 * ERN Module — Simplified Input Interfaces
 *
 * These interfaces accept business-level release + track metadata.
 * Builders read these directly to produce ERN XML via xmlbuilder2.
 */

// ============================================================================
// VERSION
// ============================================================================
export type ErnVersion = '4.3' | '3.8.2';

// ============================================================================
// MAIN INPUT
// ============================================================================

export interface ErnInput {
	/** ERN version to generate */
	version: ErnVersion;

	/** Message metadata (sender, recipient, IDs) */
	message: ErnMessageInput;

	/** Release metadata */
	release: ErnReleaseInput;

	/** Track metadata list */
	tracks: ErnTrackInput[];

	/** Deal terms (optional — defaults generated if omitted) */
	deals?: ErnDealInput[];

	/** ERN 3.8.2: OriginalMessage (add) or UpdateMessage (update/takedown) */
	updateIndicator?: 'OriginalMessage' | 'UpdateMessage';
}

// ============================================================================
// MESSAGE
// ============================================================================

export interface ErnMessageInput {
	/** Unique message identifier */
	id: string;
	/** Message sender */
	sender: ErnPartyInput;
	/** Message recipient */
	recipient: ErnPartyInput;
	/** Thread ID for grouping related messages */
	threadId?: string;
	/** XML filename (ERN 3.8.2) */
	fileName?: string;
	/** Control type (ERN 3.8.2) */
	controlType?: 'LiveMessage' | 'TestMessage';
	/** Created datetime (ISO 8601). Auto-generated if omitted */
	createdDateTime?: string;
}

export interface ErnPartyInput {
	/** DDEX Party ID (DPID) */
	partyId: string;
	/** Party name */
	name: string;
	/** Whether partyId is a DPID (ERN 3.8.2) */
	isDPID?: boolean;
}

// ============================================================================
// RELEASE
// ============================================================================

export interface ErnReleaseInput {
	/** UPC / EAN code */
	upc: string;
	/** Release title */
	title: string;
	/** Subtitle / version (Deluxe, Remastered, etc.) */
	version?: string;
	/** Release type */
	type: 'Album' | 'Single' | 'EP' | (string & {});
	/** Release date (YYYY-MM-DD) */
	releaseDate: string;
	/** Primary genre */
	genre: string;
	/** Sub-genre */
	subGenre?: string;
	/** Label name */
	labelName: string;
	/** P-Line copyright */
	pLine?: ErnCopyrightInput;
	/** C-Line copyright */
	cLine?: ErnCopyrightInput;
	/** Display artists for the release */
	artists: ErnArtistInput[];
	/** Cover art file */
	coverArt?: ErnCoverArtInput;
	/** Territory codes (ISO 3166), default: ['Worldwide'] */
	territories?: string[];
	/** Catalog number */
	catalogNumber?: string;
	/** Whether UPC is an EAN (ERN 3.8.2) */
	isEan?: boolean;
	/** Parental warning type */
	parentalWarning?: string;
}

// ============================================================================
// TRACK
// ============================================================================

export interface ErnTrackInput {
	/** ISRC code */
	isrc: string;
	/** Track title */
	title: string;
	/** Subtitle / version */
	version?: string;
	/** Duration: ISO 8601 string ("PT3M16S") or seconds (196) */
	duration: string | number;
	/** Track order / sequence number (1-based) */
	order: number;
	/** Primary genre (falls back to release genre if omitted) */
	genre?: string;
	/** Sub-genre */
	subGenre?: string;
	/** Language of vocal performance (ISO 639) */
	languageOfPerformance?: string;
	/** Parental warning type */
	parentalWarning?: string;
	/** Display artists for this track */
	artists: ErnArtistInput[];
	/** Contributors (composers, lyricists, producers, etc.) */
	contributors?: ErnContributorInput[];
	/** P-Line copyright (falls back to release P-Line if omitted) */
	pLine?: ErnCopyrightInput;
	/** ISWC code for the musical work (ERN 4.3) */
	iswc?: string;
	/** Recording mode (e.g. 'Stereo', 'Mono') */
	recordingMode?: string;
	/** Audio file technical details */
	audioFile?: ErnAudioFileInput;
}

// ============================================================================
// SHARED / NESTED
// ============================================================================

export interface ErnArtistInput {
	/** Artist display name */
	name: string;
	/** Artist role */
	role: 'MainArtist' | 'FeaturedArtist' | (string & {});
	/** Spotify artist ID */
	spotifyId?: string;
	/** Apple Music artist ID */
	appleMusicId?: string;
	/** Language and script code for the name */
	languageAndScriptCode?: string;
}

export interface ErnContributorInput {
	/** Contributor name */
	name: string;
	/** Contributor role */
	role: 'Composer' | 'Lyricist' | 'Producer' | 'Arranger' | (string & {});
	/** Language and script code for the name */
	languageAndScriptCode?: string;
}

export interface ErnCopyrightInput {
	/** Copyright year */
	year: number;
	/** Copyright text */
	text: string;
}

export interface ErnCoverArtInput {
	/** File name */
	fileName: string;
	/** File path */
	filePath?: string;
	/** Image codec type */
	codecType?: 'JPEG' | 'PNG' | (string & {});
	/** Width in pixels */
	width?: number;
	/** Height in pixels */
	height?: number;
	/** Hash sum for integrity */
	hashSum?: string;
	/** Hash algorithm */
	hashAlgorithm?: string;
}

export interface ErnAudioFileInput {
	/** File name */
	fileName: string;
	/** File path */
	filePath?: string;
	/** Audio codec type */
	codecType?: 'WAV' | 'FLAC' | 'MP3' | 'AAC' | (string & {});
	/** Bit rate in kbps */
	bitRate?: number;
	/** Sampling rate in Hz */
	samplingRate?: number;
	/** Number of channels */
	channels?: string;
	/** Bit depth */
	bitDepth?: number;
	/** Hash sum for integrity */
	hashSum?: string;
	/** Hash algorithm */
	hashAlgorithm?: string;
}

export interface ErnDealInput {
	/** Territory codes */
	territories: string[];
	/** Deal start datetime (ISO 8601) */
	startDate: string;
	/** Deal end datetime (ISO 8601) */
	endDate?: string;
	/** Commercial model types */
	commercialModels: string[];
	/** Use types */
	useTypes: string[];
	/** Whether this is a takedown deal (ERN 3.8.2) */
	takeDown?: boolean;

	prices?: ErnPriceInput[];
}

// price
export interface ErnPriceInput {
	priceType: string;
	priceTypeNamespace?: string;
	value: number | string;
	currencyCode: string;
	territories?: string[];
}

// ============================================================================
// MANIFEST MESSAGE (BatchComplete)
// ============================================================================

export type ManifestSchemaVersion = 'ern-c-sftp/17' | 'echo/11';

export interface ManifestInput {
	/** Schema version: 'ern-c-sftp/17' (default) or 'echo/11' */
	schemaVersion?: ManifestSchemaVersion;
	/** Message sender */
	sender: ErnPartyInput;
	/** Message recipient */
	recipient: ErnPartyInput;
	/** Created datetime (ISO 8601). Auto-generated if omitted */
	createdDateTime?: string;
	/** Test flag (default: false) */
	isTestFlag?: boolean;
	/** Root directory (default: './') */
	rootDirectory?: string;
	/** Delivery type (ern-c-sftp/17 only, e.g. 'NewReleaseDelivery') */
	deliveryType?: string;
	/** Product type (ern-c-sftp/17 only, e.g. 'AudioProduct') */
	productType?: string;
	/** Batch-level delivery type with namespace (echo/11 only) */
	batchDeliveryType?: { value: string; namespace: string };
	/** Batch-level product type with namespace (echo/11 only) */
	batchProductType?: { value: string; namespace: string };
	/** Messages in the batch */
	messages: ManifestMessageEntry[];
}

export interface ManifestMessageEntry {
	/** Message type (default: 'NewReleaseMessage') */
	messageType?: string;
	/** Message ID */
	messageId: string;
	/** URL / path to the ERN XML file */
	url: string;
	/** Release identifiers */
	releaseId: ManifestReleaseId;
	/** Delivery type per message (ern-c-sftp/17 only) */
	deliveryType?: string;
	/** Product type per message (ern-c-sftp/17 only) */
	productType?: string;
	/** Hash sum for integrity verification */
	hashSum?: { value: string; algorithm: string };
}

export interface ManifestReleaseId {
	/** GRid identifier */
	grid?: string;
	/** ICPN (UPC/EAN) */
	icpn?: string;
	/** Whether ICPN is an EAN */
	isEan?: boolean;
	/** Proprietary identifier */
	proprietaryId?: { namespace: string; value: string };
}
