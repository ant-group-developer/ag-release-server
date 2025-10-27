// export interface DdexMessage {
// 	header: MessageHeader;
// 	partyList: Party[];
// 	resourceList: SoundRecording[];
// 	releaseList: Release[];
// 	dealList: ReleaseDeal[];
// }

// export interface MessageHeader {
// 	messageId: string;
// 	senderId: string;
// 	recipientId: string;
// 	createdAt: string;
// 	controlType: 'Live' | 'Test' | 'Update' | 'Takedown';
// }

// export interface Party {
// 	partyRef: string;
// 	name: string;
// 	roles?: PartyRole[];
// 	isni?: string;
// 	dpid?: string;
// 	proprietaryId?: string;
// }

// export type PartyRole =
// 	| 'MainArtist'
// 	| 'Composer'
// 	| 'Lyricist'
// 	| 'Producer'
// 	| 'Label'
// 	| 'Distributor';

// export interface ContributorRef {
// 	partyRef: string;
// 	roles: PartyRole[];
// }

// export interface SoundRecording {
// 	resourceRef: string;
// 	isrc: string;
// 	title: string;
// 	durationSec?: number;
// 	contributors: ContributorRef[];
// 	genre?: string;
// 	subGenre?: string;
// 	explicit?: boolean;
// 	tech?: {
// 		codec?: string;
// 		bitrateKbps?: number;
// 		sampleRateHz?: number;
// 		bitDepth?: number;
// 		filePath?: string;
// 	};
// }

// export interface Release {
// 	releaseRef: string;
// 	upc: string;
// 	title: string;
// 	// type: 'Album' | 'Single' | 'EP' | 'Compilation' | 'Track';
// 	type: string;
// 	displayArtistRefs?: string[];
// 	label?: string;
// 	originalReleaseDate?: string;
// 	releaseDate?: string;
// 	releaseTimezone?: string;
// 	resourceRefs: string[];
// }

// export interface ReleaseDeal {
// 	releaseRef: string;
// 	deals: Deal[];
// }

// export interface Deal {
// 	territories: string[] | ['WORLD'];
// 	usage: Array<'STREAM' | 'DOWNLOAD'>;
// 	commercialModel: Array<'SUBSCRIPTION' | 'AD_FUNDED' | 'PURCHASE'>;
// 	startDate: string;
// 	endDate?: string;
// 	dspId?: string;
// 	priceTier?: string;
// }

export interface DdexMessage {
	header: MessageHeader;
	partyList: Party[];
	resourceList: Resource[];
	releaseList: ReleaseItem[];
	dealList: DealItem[];
}

export interface MessageHeader {
	messageThreadId?: string;
	messageId: string;
	senderPartyId: string;
	senderPartyName: string;
	recipientPartyId: string;
	recipientPartyName: string;
	messageCreatedDateTime: string;
	releaseProfileVersionId?: string;
	languageAndScriptCode?: string;
}

export interface Party {
	partyReference: string;
	partyName: string;
	partyId?: PartyId[];
}

export interface PartyId {
	isni?: string;
	dpid?: string;
	proprietaryId?: {
		namespace: string;
		value: string;
	};
}

export interface Resource {
	resourceReference: string;
	type: 'SoundRecording' | 'Image' | 'Video';
	resourceId: ResourceId;
	displayTitleText: string;
	displayTitle: DisplayTitle;
	displayArtistName?: string;
	displayArtist?: DisplayArtist[];
	contributor?: Contributor[];
	duration?: string; // ISO 8601 duration format PT0H4M33S
	parentalWarningType?: 'NotExplicit' | 'Explicit' | 'Unknown';
	soundRecordingEdition?: SoundRecordingEdition;
	workId?: WorkId;
	genre?: string;
	pLine?: PLine;
	cLine?: CLine;
}

export interface ResourceId {
	isrc?: string;
	proprietaryId?: {
		namespace: string;
		value: string;
	};
}

export interface WorkId {
	iswc?: string;
}

export interface DisplayTitle {
	titleText: string;
	applicableTerritoryCode?: string;
	isDefault?: boolean;
}

export interface DisplayArtist {
	sequenceNumber: number;
	artistPartyReference: string;
	displayArtistRole: 'MainArtist' | 'FeaturedArtist' | 'ContractedArtist';
	artisticRole?: string;
}

export interface Contributor {
	sequenceNumber: number;
	contributorPartyReference: string;
	role: string;
	namespace?: string;
	userDefinedValue?: string;
}

export interface SoundRecordingEdition {
	type: 'NonImmersiveEdition' | 'ImmersiveEdition';
	recordingMode?: 'Stereo' | 'Mono' | 'Binaural';
	pLine?: PLine;
	technicalDetails?: TechnicalDetails;
}

export interface TechnicalDetails {
	technicalResourceDetailsReference: string;
	deliveryFile?: {
		type: 'AudioFile' | 'ImageFile' | 'VideoFile';
		uri: string;
		isProvidedInDelivery: boolean;
	};
	file?: {
		uri: string;
	};
}

export interface PLine {
	year: number;
	pLineText: string;
}

export interface CLine {
	year: number;
	cLineText: string;
}

export interface ReleaseItem {
	releaseReference: string;
	releaseType: 'Single' | 'Album' | 'EP' | 'TrackRelease';
	releaseId: ReleaseId;
	displayTitleText?: string;
	displayTitle?: DisplayTitle;
	displayArtistName?: string;
	displayArtist?: DisplayArtist[];
	releaseLabelReference?: string;
	pLine?: PLine;
	cLine?: CLine;
	genre?: Genre;
	originalReleaseDate?: string;
	releaseVisibilityReference?: string;
	parentalWarningType?: 'NotExplicit' | 'Explicit' | 'Unknown';
	resourceGroup?: ResourceGroup;
	releaseResourceReference?: string; // For TrackRelease
}

export interface ReleaseId {
	icpn?: string; // UPC/EAN
	proprietaryId?: {
		namespace: string;
		value: string;
	};
}

export interface Genre {
	genreText: string;
	applicableTerritoryCode?: string;
}

export interface ResourceGroup {
	sequenceNumber: number;
	resourceGroupContentItem: ResourceGroupContentItem[];
	linkedReleaseResourceReference?: string[]; // For cover art, etc.
}

export interface ResourceGroupContentItem {
	sequenceNumber: number;
	releaseResourceReference: string;
}

export interface DealItem {
	dealReleaseReference: string;
	deal?: Deal[];
	releaseVisibility?: ReleaseVisibility;
	trackReleaseVisibility?: TrackReleaseVisibility;
}

export interface Deal {
	dealTerms: DealTerms;
	dealTechnicalResourceDetailsReferenceList?: string[];
}

export interface DealTerms {
	territoryCode: string | string[];
	validityPeriod?: {
		startDateTime: string;
		endDateTime?: string;
	};
	commercialModelType: Array<
		'SubscriptionModel' | 'AdvertisementSupportedModel' | 'PurchaseModel'
	>;
	useType: Array<'Stream' | 'ConditionalDownload' | 'PermanentDownload'>;
	priceInformation?: {
		priceTier?: string;
	};
}

export interface ReleaseVisibility {
	visibilityReference: string;
	territoryCode: string;
	releaseDisplayStartDateTime?: string;
	coverArtPreviewStartDateTime?: string;
	fullTrackListingPreviewStartDateTime?: string;
}

export interface TrackReleaseVisibility {
	visibilityReference: string;
	territoryCode: string;
	trackListingPreviewStartDateTime?: string;
}
