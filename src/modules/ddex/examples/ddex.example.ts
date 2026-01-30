/**
 * Example usage of DDEX Generator Module
 *
 * This file demonstrates how to use the DDEXService to generate
 * DDEX ERN 4.3 XML for both Single and Album releases.
 */

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
		version: '4.3',
		data: singleExample,
	});

	// Generate Album
	const albumXml = ddexService.generate({
		version: '4.3',
		data: albumExample,
	});

	return { singleXml, albumXml };
}
