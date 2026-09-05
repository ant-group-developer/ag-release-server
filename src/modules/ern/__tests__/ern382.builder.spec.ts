import { Ern382Builder } from '../builders/ern382.builder';
import { ErnInput } from '../interfaces/ern-input.interface';

import { ErnVersion } from '../interfaces/ern-input.interface';

describe('Ern382Builder', () => {
	const singleInput: ErnInput = {
		version: ErnVersion.ERN_382,
		message: {
			id: '1111',
			threadId: 'R1000001',
			sender: {
				partyId: 'PADPIDA20250111111',
				name: 'TEST Provider',
				isDPID: true,
			},
			recipient: {
				partyId: 'PADPIDA20250222222',
				name: 'DSP Platform',
				isDPID: true,
			},
			createdDateTime: '2025-11-25T12:43:22+08:00',
		},
		updateIndicator: 'OriginalMessage',
		release: {
			upc: '4061707105869',
			title: 'TEST CONTENT',
			type: 'Album',
			releaseDate: '2025-11-25',
			genre: 'POP',
			subGenre: 'K-POP',
			labelName: 'Kanjian Music',
			isEan: false,
			territories: ['CN'],
			pLine: { year: 2024, text: 'Kanjian Music' },
			cLine: { year: 2024, text: 'Kanjian Music' },
			artists: [
				{
					name: 'TEST Artist',
					role: 'MainArtist',
					languageAndScriptCode: 'zh-Hans',
				},
			],
			coverArt: {
				fileName: '4061707105869.jpg',
				filePath: 'resources/',
				codecType: 'JPEG',
				width: 3000,
				height: 3000,
				hashSum: '349c0c8c02d53d508106d1341c7d6e38',
				hashAlgorithm: 'MD5',
			},
		},
		tracks: [
			{
				isrc: 'DEAR41867226',
				title: 'TEST Audio',
				version: 'TEST Version',
				duration: 'PT2M45S',
				order: 1,
				genre: 'POP',
				subGenre: 'K-POP',
				artists: [
					{
						name: 'TEST Artist',
						role: 'MainArtist',
						languageAndScriptCode: 'zh-Hans',
					},
				],
				contributors: [
					{ name: 'Lyricist One', role: 'Lyricist' },
					{ name: 'Composer One', role: 'Composer' },
					{ name: 'Producer One', role: 'Producer' },
				],
				audioFile: {
					fileName: 'DEAR41867226.mp3',
					filePath: 'resources/',
					codecType: 'MP3',
					bitRate: 128,
					samplingRate: 44100,
					channels: '2',
					bitDepth: 16,
					hashSum: '9661274900293eead3a3fbe7966a59bc',
					hashAlgorithm: 'MD5',
				},
			},
		],
		deals: [
			{
				territories: ['CN', 'US'],
				startDate: '2025-11-25T12:43:22+08:00',
				endDate: '2099-12-31T00:00:00Z',
				commercialModels: ['SubscriptionModel'],
				useTypes: ['ConditionalDownload'],
			},
		],
	};

	let xml: string;

	beforeAll(() => {
		xml = new Ern382Builder(singleInput).build();
	});

	it('should produce valid XML declaration', () => {
		expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
	});

	it('should have ERN 3.8.2 namespace', () => {
		expect(xml).toContain('xmlns:ern="http://ddex.net/xml/ern/382"');
	});

	it('should NOT contain PartyList', () => {
		expect(xml).not.toContain('<PartyList>');
	});

	it('should contain UpdateIndicator', () => {
		expect(xml).toContain(
			'<UpdateIndicator>OriginalMessage</UpdateIndicator>',
		);
	});

	it('should contain IsDPID attribute', () => {
		expect(xml).toContain('IsDPID="true"');
	});

	it('should contain MessageHeader', () => {
		expect(xml).toContain('<MessageHeader>');
		expect(xml).toContain('<MessageId>1111</MessageId>');
		expect(xml).toContain('TEST Provider');
	});

	it('should contain SoundRecording with ISRC', () => {
		expect(xml).toContain('<ISRC>DEAR41867226</ISRC>');
	});

	it('should use SoundRecordingDetailsByTerritory', () => {
		expect(xml).toContain('<SoundRecordingDetailsByTerritory>');
	});

	it('should have inline DisplayArtist with ArtistRole', () => {
		expect(xml).toContain('<DisplayArtist SequenceNumber="1">');
		expect(xml).toContain('<FullName>TEST Artist</FullName>');
		expect(xml).toContain('<ArtistRole>MainArtist</ArtistRole>');
	});

	it('should NOT contain ArtistPartyReference (4.3 only)', () => {
		expect(xml).not.toContain('<ArtistPartyReference>');
	});

	it('should contain ResourceContributor', () => {
		expect(xml).toContain('<ResourceContributor>');
	});

	it('should contain IndirectResourceContributor for composers', () => {
		expect(xml).toContain('<IndirectResourceContributor>');
		expect(xml).toContain(
			'<IndirectResourceContributorRole>Lyricist</IndirectResourceContributorRole>',
		);
		expect(xml).toContain(
			'<IndirectResourceContributorRole>Composer</IndirectResourceContributorRole>',
		);
	});

	it('should handle UserDefined role for Producer', () => {
		expect(xml).toContain('UserDefinedValue="Producer"');
		expect(xml).toContain('>UserDefined</IndirectResourceContributorRole>');
	});

	it('should contain technical audio details', () => {
		expect(xml).toContain('<TechnicalSoundRecordingDetails>');
		expect(xml).toContain('<AudioCodecType>MP3</AudioCodecType>');
		expect(xml).toContain('<SamplingRate>44100</SamplingRate>');
		expect(xml).toContain('<BitsPerSample>16</BitsPerSample>');
	});

	it('should contain Image with cover art', () => {
		expect(xml).toContain('<Image>');
		expect(xml).toContain('<ImageType>FrontCoverImage</ImageType>');
		expect(xml).toContain('<ImageCodecType>JPEG</ImageCodecType>');
		expect(xml).toContain('<ImageHeight>3000</ImageHeight>');
	});

	it('should contain ReleaseList with releases', () => {
		expect(xml).toContain('<ReleaseList>');
		expect(xml).toContain('<ReleaseType>TrackRelease</ReleaseType>');
		expect(xml).toContain('<ReleaseType>Album</ReleaseType>');
	});

	it('should have ReleaseDetailsByTerritory', () => {
		expect(xml).toContain('<ReleaseDetailsByTerritory>');
		expect(xml).toContain('<TerritoryCode>CN</TerritoryCode>');
	});

	it('should contain related release reference', () => {
		expect(xml).toContain('<RelatedRelease>');
		expect(xml).toContain(
			'<ReleaseRelationshipType>IsReleaseFromRelease</ReleaseRelationshipType>',
		);
	});

	it('should contain PLine and CLine at release level', () => {
		expect(xml).toContain('<PLine>');
		expect(xml).toContain('<PLineText>Kanjian Music</PLineText>');
		expect(xml).toContain('<CLine>');
		expect(xml).toContain('<CLineText>Kanjian Music</CLineText>');
	});

	it('should contain DealList with explicit deals', () => {
		expect(xml).toContain('<DealList>');
		expect(xml).toContain('<ReleaseDeal>');
		expect(xml).toContain('<UseType>ConditionalDownload</UseType>');
	});

	it('should contain hash sum for audio file', () => {
		expect(xml).toContain(
			'<HashSum>9661274900293eead3a3fbe7966a59bc</HashSum>',
		);
		expect(xml).toContain(
			'<HashSumAlgorithmType>MD5</HashSumAlgorithmType>',
		);
	});

	it('should contain LanguageAndScriptCode attribute', () => {
		expect(xml).toContain('LanguageAndScriptCode="zh-Hans"');
	});

	it('should have version subtitle in display title', () => {
		expect(xml).toContain('TEST Audio (TEST Version)');
	});
});
