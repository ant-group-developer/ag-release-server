export interface DdexMessage {
	header: MessageHeader;
	partyList: Party[];
	resourceList: SoundRecording[];
	releaseList: Release[];
	dealList: ReleaseDeal[];
}

export interface MessageHeader {
	messageId: string;
	senderId: string;
	recipientId: string;
	createdAt: string;
	controlType: 'Live' | 'Test' | 'Update' | 'Takedown';
}

export interface Party {
	partyRef: string;
	name: string;
	roles?: PartyRole[];
	isni?: string;
	dpid?: string;
	proprietaryId?: string;
}

export type PartyRole =
	| 'MainArtist'
	| 'Composer'
	| 'Lyricist'
	| 'Producer'
	| 'Label'
	| 'Distributor';

export interface ContributorRef {
	partyRef: string;
	roles: PartyRole[];
}

export interface SoundRecording {
	resourceRef: string;
	isrc: string;
	title: string;
	durationSec?: number;
	contributors: ContributorRef[];
	genre?: string;
	subGenre?: string;
	explicit?: boolean;
	tech?: {
		codec?: string;
		bitrateKbps?: number;
		sampleRateHz?: number;
		bitDepth?: number;
		filePath?: string;
	};
}

export interface Release {
	releaseRef: string;
	upc: string;
	title: string;
	// type: 'Album' | 'Single' | 'EP' | 'Compilation' | 'Track';
	type: string;
	displayArtistRefs?: string[];
	label?: string;
	originalReleaseDate?: string;
	releaseDate?: string;
	releaseTimezone?: string;
	resourceRefs: string[];
}

export interface ReleaseDeal {
	releaseRef: string;
	deals: Deal[];
}

export interface Deal {
	territories: string[] | ['WORLD'];
	usage: Array<'STREAM' | 'DOWNLOAD'>;
	commercialModel: Array<'SUBSCRIPTION' | 'AD_FUNDED' | 'PURCHASE'>;
	startDate: string;
	endDate?: string;
	dspId?: string;
	priceTier?: string;
}
