/**
 * Example usage of DDEX Generator Module
 *
 * This file demonstrates how to use the DDEXService to generate
 * DDEX ERN 4.3 XML for both Single and Album releases.
 */

import { ErnVersion } from '../../ern/interfaces/ern-input.interface';
import { DDEXService } from '../ddex.service';
import { DDEXData } from '../interfaces/ddex-input.interface';

// ==================== Single Example ====================
export const singleExample: DDEXData = {
	messageHeader: {
		messageId: '00001',
		sender: {
			partyId: 'PADPIDA20250804056',
			partyName: 'ANT MUSIC LLC',
		},
		recipient: {
			partyId: 'PADPIDA2011072101T',
			partyName: 'Spotify',
		},
	},
	parties: [
		{
			reference: 'P1',
			name: 'Fuuji Liam',
			partyId: {
				namespace: 'PADPIDA2011072101T',
				value: 'spotify:artist:37i9dQZF1E4vh3bs2l4OK0',
			},
		},
		{
			reference: 'P2',
			name: 'AMG', // Label
		},
	],
	resources: [
		{
			reference: 'A1',
			type: 'SoundRecording',
			isrc: 'QT6KL2500017',
			title: 'Timeless',
			displayArtistName: 'Fuuji Liam',
			displayArtists: [
				{ partyRef: 'P1', role: 'MainArtist', sequenceNumber: 1 },
			],
			contributors: [
				{ partyRef: 'P1', role: 'Composer', sequenceNumber: 1 },
			],
			duration: 'PT0H4M58S',
			pLine: { year: 2025, text: 'AMG, Exclusive Licensed ANT MUSIC' },
			technicalDetails: {
				reference: 'T1S',
				fileUri: 'resources/QT6KL2500017_T1S.wav',
				isProvidedInDelivery: true,
			},
			parentalWarningType: 'NotExplicit',
		},
		{
			reference: 'A2',
			type: 'Image',
			imageType: 'FrontCoverImage',
			cLine: { year: 2025, text: 'AMG, Exclusive Licensed ANT MUSIC' },
			technicalDetails: {
				reference: 'T2',
				fileUri: 'resources/850080651025.jpg',
			},
			parentalWarningType: 'NotExplicit',
		},
	],
	releases: [
		{
			reference: 'R0',
			type: 'Single',
			icpn: '850080651025',
			title: 'Timeless',
			displayArtistName: 'Fuuji Liam',
			displayArtists: [
				{ partyRef: 'P1', role: 'MainArtist', sequenceNumber: 1 },
			],
			labelRef: 'P2',
			pLine: { year: 2025, text: 'AMG, Exclusive Licensed ANT MUSIC' },
			cLine: { year: 2025, text: 'AMG, Exclusive Licensed ANT MUSIC' },
			genre: 'Piano',
			releaseDate: '2025-12-11',
			resourceRefs: ['A1'],
			coverArtRef: 'A2',
			parentalWarningType: 'NotExplicit',
		},
	],
	deals: [
		{
			releaseRef: 'R0',
			territories: ['US'],
			validityStartDateTime: '2025-12-11T00:00:00',
			commercialModelTypes: [
				'SubscriptionModel',
				'AdvertisementSupportedModel',
			],
			useTypes: ['ConditionalDownload', 'Stream'],
		},
		{
			releaseRef: 'R1',
			territories: ['US'],
			validityStartDateTime: '2025-12-11T00:00:00',
			commercialModelTypes: [
				'SubscriptionModel',
				'AdvertisementSupportedModel',
			],
			useTypes: ['ConditionalDownload', 'Stream'],
			technicalResourceRef: 'T1S',
		},
	],
};

// ==================== Album Example ====================
export const albumExample: DDEXData = {
	messageHeader: {
		messageId: '00001',
		sender: {
			partyId: 'PADPIDA20250804056',
			partyName: 'ANT MUSIC LLC',
		},
		recipient: {
			partyId: 'PADPIDA2011072101T',
			partyName: 'Spotify',
		},
	},
	parties: [
		{
			reference: 'P1',
			name: 'Donald S. Evans',
			partyId: {
				namespace: 'PADPIDA2011072101T',
				value: 'spotify:artist:34nZgjuSy4ogN8SS1tC67n',
			},
		},
		{
			reference: 'P2',
			name: 'AMG',
		},
	],
	resources: [
		// Track 1
		{
			reference: 'A1',
			type: 'SoundRecording',
			isrc: 'QT6KL2500010',
			title: 'Sensation',
			displayArtistName: 'Donald S. Evans',
			displayArtists: [
				{ partyRef: 'P1', role: 'MainArtist', sequenceNumber: 1 },
			],
			contributors: [
				{ partyRef: 'P1', role: 'Composer', sequenceNumber: 1 },
			],
			duration: 'PT0H3M16S',
			pLine: { year: 2025, text: 'AMG, Exclusive Licensed ANT MUSIC' },
			technicalDetails: {
				reference: 'T1S',
				fileUri: 'resources/QT6KL2500010_T1S.wav',
				isProvidedInDelivery: true,
			},
		},
		// Track 2
		{
			reference: 'A2',
			type: 'SoundRecording',
			isrc: 'QT6KL2500011',
			title: 'Faith In You',
			displayArtistName: 'Donald S. Evans',
			displayArtists: [
				{ partyRef: 'P1', role: 'MainArtist', sequenceNumber: 1 },
			],
			contributors: [
				{ partyRef: 'P1', role: 'Composer', sequenceNumber: 1 },
			],
			duration: 'PT0H3M44S',
			pLine: { year: 2025, text: 'AMG, Exclusive Licensed ANT MUSIC' },
			technicalDetails: {
				reference: 'T2S',
				fileUri: 'resources/QT6KL2500011_T2S.wav',
				isProvidedInDelivery: true,
			},
		},
		// ... more tracks would be added similarly
		// Cover Art
		{
			reference: 'A8',
			type: 'Image',
			imageType: 'FrontCoverImage',
			cLine: { year: 2025, text: 'AMG, Exclusive Licensed ANT MUSIC' },
			technicalDetails: {
				reference: 'T8',
				fileUri: 'resources/850080651018.jpg',
			},
		},
	],
	releases: [
		{
			reference: 'R0',
			type: 'Album',
			icpn: '850080651018',
			title: 'Faith In You',
			displayArtistName: 'Donald S. Evans',
			displayArtists: [
				{ partyRef: 'P1', role: 'MainArtist', sequenceNumber: 1 },
			],
			labelRef: 'P2',
			pLine: { year: 2025, text: 'AMG, Exclusive Licensed ANT MUSIC' },
			cLine: { year: 2025, text: 'AMG, Exclusive Licensed ANT MUSIC' },
			genre: 'Jazz',
			releaseDate: '2025-12-20',
			resourceRefs: ['A1', 'A2'], // All track references
			coverArtRef: 'A8',
		},
	],
	deals: [
		// Main release deal
		{
			releaseRef: 'R0',
			territories: ['US'],
			validityStartDateTime: '2025-12-20T00:00:00',
			commercialModelTypes: [
				'SubscriptionModel',
				'AdvertisementSupportedModel',
			],
			useTypes: ['ConditionalDownload', 'Stream'],
		},
		// Track deals
		{
			releaseRef: 'R1',
			territories: ['US'],
			validityStartDateTime: '2025-12-20T00:00:00',
			commercialModelTypes: [
				'SubscriptionModel',
				'AdvertisementSupportedModel',
			],
			useTypes: ['ConditionalDownload', 'Stream'],
			technicalResourceRef: 'T1S',
		},
		{
			releaseRef: 'R2',
			territories: ['US'],
			validityStartDateTime: '2025-12-20T00:00:00',
			commercialModelTypes: [
				'SubscriptionModel',
				'AdvertisementSupportedModel',
			],
			useTypes: ['ConditionalDownload', 'Stream'],
			technicalResourceRef: 'T2S',
		},
	],
};

// ==================== Usage ====================
export function generateExample() {
	const ddexService = new DDEXService();

	// Generate Single
	const singleXml = ddexService.generate({
		version: ErnVersion.ERN_43,
		data: singleExample,
	});

	// Generate Album
	const albumXml = ddexService.generate({
		version: ErnVersion.ERN_43,
		data: albumExample,
	});

	// Generate ERN 3.8.2 Add
	const ern382Xml = ddexService.generate({
		version: ErnVersion.ERN_382,
		data: ern382AddExample,
	});

	return { singleXml, albumXml, ern382Xml };
}

// ==================== ERN 3.8.2 Add Example ====================
export const ern382AddExample: DDEXData = {
	messageHeader: {
		messageThreadId: 'R1000001',
		messageId: '1111',
		messageFileName: '4061707105869.xml',
		sender: {
			partyId: 'PADPIDA20250111111',
			partyName: 'TEST Content Provider',
			isDPID: true,
		},
		recipient: {
			partyId: 'PADPIDA20250111111',
			partyName: 'Singing Network Technology shanghai CO. LTD.',
			isDPID: true,
		},
		createdDateTime: '2025-11-25T12:43:22+08:00',
		messageControlType: 'LiveMessage',
	},
	updateIndicator: 'OriginalMessage',
	parties: [], // ERN 3.8.2 does not use PartyList
	resources: [
		// Sound Recording
		{
			reference: 'A1',
			type: 'SoundRecording',
			isrc: 'DEAR41867226',
			title: 'TEST Audio',
			subTitle: 'TEST Version',
			languageOfPerformance: 'zh',
			duration: 'PT2M45S',
			isArtistRelated: false,
			applicableTerritoryCode: 'CN',
			displayArtists: [
				{
					partyRef: 'TEST Artist',
					role: 'MainArtist',
					sequenceNumber: 1,
					applicableTerritoryCode: 'zh-Hans',
				},
			],
			resourceContributors: [
				{
					fullName: 'TEST Artist',
					role: 'MainArtist',
					sequenceNumber: 1,
					languageAndScriptCode: 'zh-Hans',
				},
			],
			indirectResourceContributors: [
				{
					fullName: 'TEST Lyricist',
					role: 'Lyricist',
					languageAndScriptCode: 'zh-Hans',
				},
				{
					fullName: 'TEST Composer',
					role: 'Composer',
					languageAndScriptCode: 'zh-Hans',
				},
				{
					fullName: 'TEST Producer',
					role: 'UserDefined',
					userDefinedValue: 'Producer',
					languageAndScriptCode: 'zh-Hans',
				},
			],
			pLine: { year: 2024, text: 'Kanjian Music' },
			sequenceNumber: 1,
			genre: 'POP',
			subGenre: 'K-POP',
			technicalDetails: {
				reference: 'T_audio_DEAR41867226',
				fileUri: 'DEAR41867226.mp3',
				fileName: 'DEAR41867226.mp3',
				filePath: 'resources/',
				audioCodecType: 'MP3',
				bitRate: 128,
				numberOfChannels: '2',
				samplingRate: 44100,
				bitsPerSample: 16,
				hashSum: '9661274900293eead3a3fbe7966a59bc',
				hashSumAlgorithmType: 'MD5',
			},
		},
		// Image (Cover Art)
		{
			reference: 'A3',
			type: 'Image',
			imageType: 'FrontCoverImage',
			applicableTerritoryCode: 'CN',
			imageCodecType: 'JPEG',
			imageHeight: 3000,
			imageWidth: 3000,
			technicalDetails: {
				reference: 'T_cover_4061707105869',
				fileUri: '4061707105869.jpg',
				fileName: '4061707105869.jpg',
				filePath: 'resources/',
				hashSum: '349c0c8c02d53d508106d1341c7d6e38',
				hashSumAlgorithmType: 'MD5',
			},
		},
		// Text (Lyrics)
		{
			reference: 'A2',
			type: 'Text',
			textType: 'LyricText',
			territoryCodes: ['CN', 'US'],
			technicalDetails: {
				reference: 'T_lyrics_DEAR41867226',
				fileUri: 'DEAR41867226.txt',
				fileName: 'DEAR41867226.txt',
				filePath: 'resources/',
				hashSum: '9661274900293eead3a3fbe7966a59bc_lyric',
				hashSumAlgorithmType: 'MD5',
			},
		},
	],
	releases: [
		// Main Release (Album)
		{
			reference: 'R0',
			type: 'Album',
			icpn: '4061707105869',
			isEan: false,
			title: 'TEST CONTENT',
			displayArtistName: 'TEST Artist',
			displayArtists: [
				{
					partyRef: 'TEST Artist',
					role: 'MainArtist',
					sequenceNumber: 1,
					applicableTerritoryCode: 'zh-Hans',
				},
			],
			labelRef: 'Kanjian Music',
			labelName: 'Kanjian Music',
			territoryCodes: ['CN'],
			genre: 'POP',
			subGenre: 'K-POP',
			releaseDate: '2025-11-25',
			isMainRelease: true,
			resourceRefs: ['A1', 'A2', 'A3'],
			linkedResourceRefs: [{ ref: 'A2', linkDescription: 'Lyrics' }],
			pLine: { year: 2024, text: 'Kanjian Music' },
			cLine: { year: 2024, text: 'Kanjian Music' },
		},
		// Track Release
		{
			reference: 'R1',
			type: 'TrackRelease',
			icpn: '',
			isrc: 'DEAR41867226',
			title: 'TEST Audio',
			subTitle: 'TEST Version',
			displayArtistName: 'TEST Artist',
			displayArtists: [
				{
					partyRef: 'TEST Artist',
					role: 'MainArtist',
					sequenceNumber: 1,
					applicableTerritoryCode: 'zh-Hans',
				},
			],
			labelRef: 'Kanjian Music',
			labelName: 'Kanjian Music',
			territoryCodes: ['CN'],
			genre: '1',
			subGenre: '1',
			releaseDate: '2025-11-25',
			resourceRefs: ['A1', 'A2'],
			linkedResourceRefs: [{ ref: 'A2', linkDescription: 'Lyrics' }],
			pLine: { year: 2024, text: 'Kanjian Music' },
			cLine: { year: 2024, text: 'Kanjian Music' },
		},
	],
	deals: [
		// Release R0 - SubscriptionModel + ConditionalDownload
		{
			releaseRef: 'R0',
			territories: ['CN', 'US'],
			validityStartDateTime: '2025-11-25T12:43:22+08:00',
			validityEndDateTime: '2099-12-31T00:00:00Z',
			commercialModelTypes: ['SubscriptionModel'],
			useTypes: ['ConditionalDownload'],
		},
		// Release R0 - AdvertisementSupportedModel + OnDemandStream
		{
			releaseRef: 'R0',
			territories: ['CN', 'US'],
			validityStartDateTime: '2025-11-25T12:43:22+08:00',
			validityEndDateTime: '2099-12-31T00:00:00Z',
			commercialModelTypes: ['AdvertisementSupportedModel'],
			useTypes: ['OnDemandStream'],
		},
		// Release R1 - SubscriptionModel + ConditionalDownload
		{
			releaseRef: 'R1',
			territories: ['CN', 'US'],
			validityStartDateTime: '2025-11-25T12:43:22+08:00',
			validityEndDateTime: '2099-12-31T00:00:00Z',
			commercialModelTypes: ['SubscriptionModel'],
			useTypes: ['ConditionalDownload'],
		},
		// Release R1 - AdvertisementSupportedModel + OnDemandStream
		{
			releaseRef: 'R1',
			territories: ['CN', 'US'],
			validityStartDateTime: '2025-11-25T12:43:22+08:00',
			validityEndDateTime: '2099-12-31T00:00:00Z',
			commercialModelTypes: ['AdvertisementSupportedModel'],
			useTypes: ['OnDemandStream'],
		},
	],
};
