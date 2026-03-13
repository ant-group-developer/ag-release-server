import { Ern43Builder } from '../builders/ern43.builder';
import { ErnInput } from '../interfaces/ern-input.interface';

describe('Ern43Builder', () => {
	const singleInput: ErnInput = {
		version: '4.3',
		message: {
			id: 'MSG001',
			sender: { partyId: 'PADPIDA20250804056', name: 'ANT MUSIC LLC' },
			recipient: { partyId: 'PADPIDA2011072101T', name: 'Spotify' },
			createdDateTime: '2025-07-17T00:00:00Z',
		},
		release: {
			upc: '850080651025',
			title: 'Timeless',
			type: 'Single',
			releaseDate: '2025-12-11',
			genre: 'Piano',
			labelName: 'AMG',
			artists: [
				{
					name: 'Fuuji Liam',
					role: 'MainArtist',
					spotifyId: '37i9dQZF1E4vh3bs2l4OK0',
				},
			],
			pLine: { year: 2025, text: 'AMG, Exclusive Licensed ANT MUSIC' },
			cLine: { year: 2025, text: 'AMG, Exclusive Licensed ANT MUSIC' },
			coverArt: { fileName: '850080651025.jpg', filePath: 'resources/' },
		},
		tracks: [
			{
				isrc: 'QT6KL2500017',
				title: 'Timeless',
				duration: 298,
				order: 1,
				artists: [{ name: 'Fuuji Liam', role: 'MainArtist' }],
				contributors: [{ name: 'Fuuji Liam', role: 'Composer' }],
				audioFile: {
					fileName: 'QT6KL2500017_T1S.wav',
					filePath: 'resources/',
				},
			},
		],
	};

	const albumInput: ErnInput = {
		version: '4.3',
		message: {
			id: 'MSG002',
			sender: { partyId: 'PADPIDA20250804056', name: 'ANT MUSIC LLC' },
			recipient: { partyId: 'PADPIDA2011072101T', name: 'Spotify' },
			createdDateTime: '2025-07-17T00:00:00Z',
		},
		release: {
			upc: '850080651018',
			title: 'Faith In You',
			type: 'Album',
			releaseDate: '2025-12-20',
			genre: 'Jazz',
			labelName: 'AMG',
			artists: [{ name: 'Donald S. Evans', role: 'MainArtist' }],
			pLine: { year: 2025, text: 'AMG' },
			cLine: { year: 2025, text: 'AMG' },
			coverArt: { fileName: '850080651018.jpg' },
		},
		tracks: [
			{
				isrc: 'QT6KL2500010',
				title: 'Sensation',
				duration: 'PT0H3M16S',
				order: 1,
				artists: [{ name: 'Donald S. Evans', role: 'MainArtist' }],
				audioFile: { fileName: 'QT6KL2500010_T1S.wav' },
			},
			{
				isrc: 'QT6KL2500011',
				title: 'Faith In You',
				duration: 'PT0H3M44S',
				order: 2,
				artists: [
					{ name: 'Donald S. Evans', role: 'MainArtist' },
					{ name: 'Featured Artist', role: 'FeaturedArtist' },
				],
				audioFile: { fileName: 'QT6KL2500011_T2S.wav' },
			},
		],
	};

	describe('Single release', () => {
		let xml: string;

		beforeAll(() => {
			xml = new Ern43Builder(singleInput).build();
		});

		it('should produce valid XML with correct declaration', () => {
			expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
		});

		it('should have ERN 4.3 namespace', () => {
			expect(xml).toContain('xmlns:ern="http://ddex.net/xml/ern/43"');
		});

		it('should contain MessageHeader', () => {
			expect(xml).toContain('<MessageHeader>');
			expect(xml).toContain('<MessageId>MSG001</MessageId>');
			expect(xml).toContain('ANT MUSIC LLC');
			expect(xml).toContain('Spotify');
		});

		it('should contain PartyList with party references', () => {
			expect(xml).toContain('<PartyList>');
			expect(xml).toContain('<PartyReference>P1</PartyReference>');
			expect(xml).toContain('Fuuji Liam');
		});

		it('should include Spotify proprietary ID', () => {
			expect(xml).toContain('spotify:artist:37i9dQZF1E4vh3bs2l4OK0');
		});

		it('should contain ResourceList with SoundRecording', () => {
			expect(xml).toContain('<ResourceList>');
			expect(xml).toContain('<SoundRecording>');
			expect(xml).toContain('<ISRC>QT6KL2500017</ISRC>');
		});

		it('should use SoundRecordingEdition structure', () => {
			expect(xml).toContain('<SoundRecordingEdition>');
			expect(xml).toContain('<Type>NonImmersiveEdition</Type>');
		});

		it('should contain cover art Image', () => {
			expect(xml).toContain('<Image>');
			expect(xml).toContain('FrontCoverImage');
			expect(xml).toContain('850080651025.jpg');
		});

		it('should contain ReleaseList with main release R0', () => {
			expect(xml).toContain('<ReleaseList>');
			expect(xml).toContain('<ReleaseReference>R0</ReleaseReference>');
			expect(xml).toContain('<ReleaseType>Single</ReleaseType>');
			expect(xml).toContain('<ICPN>850080651025</ICPN>');
		});

		it('should contain TrackRelease R1', () => {
			expect(xml).toContain('<TrackRelease>');
			expect(xml).toContain('<ReleaseReference>R1</ReleaseReference>');
		});

		it('should contain ResourceGroup with sequence', () => {
			expect(xml).toContain('<ResourceGroup>');
			expect(xml).toContain(
				'<ReleaseResourceReference>A1</ReleaseResourceReference>',
			);
		});

		it('should contain DealList', () => {
			expect(xml).toContain('<DealList>');
			expect(xml).toContain('<ReleaseDeal>');
			expect(xml).toContain(
				'<DealReleaseReference>R1</DealReleaseReference>',
			);
		});

		it('should contain ReleaseVisibility', () => {
			expect(xml).toContain('<ReleaseVisibility>');
			expect(xml).toContain(
				'<VisibilityReference>V0</VisibilityReference>',
			);
		});

		it('should convert numeric duration to ISO format', () => {
			expect(xml).toContain('<Duration>PT0H4M58S</Duration>');
		});

		it('should contain PLine and CLine', () => {
			expect(xml).toContain('<PLine>');
			expect(xml).toContain(
				'<PLineText>AMG, Exclusive Licensed ANT MUSIC</PLineText>',
			);
			expect(xml).toContain('<CLine>');
			expect(xml).toContain(
				'<CLineText>AMG, Exclusive Licensed ANT MUSIC</CLineText>',
			);
		});

		it('should contain Contributor with role', () => {
			expect(xml).toContain('<Contributor');
			expect(xml).toContain('<ContributorPartyReference>');
			expect(xml).toContain('Composer');
		});
	});

	describe('Album release', () => {
		let xml: string;

		beforeAll(() => {
			xml = new Ern43Builder(albumInput).build();
		});

		it('should have Album release type', () => {
			expect(xml).toContain('<ReleaseType>Album</ReleaseType>');
		});

		it('should have 2 SoundRecordings', () => {
			const matches = xml.match(/<SoundRecording>/g);
			expect(matches).toHaveLength(2);
		});

		it('should have 2 TrackReleases', () => {
			const matches = xml.match(/<TrackRelease>/g);
			expect(matches).toHaveLength(2);
		});

		it('should have ResourceGroup with 2 items', () => {
			expect(xml).toContain(
				'<ReleaseResourceReference>A1</ReleaseResourceReference>',
			);
			expect(xml).toContain(
				'<ReleaseResourceReference>A2</ReleaseResourceReference>',
			);
		});

		it('should deduplicate artists in PartyList', () => {
			// Appears in PartyList once + multiple references, not duplicated
			const partyMatches = xml.match(
				/<PartyReference>P1<\/PartyReference>/g,
			);
			expect(partyMatches).toHaveLength(1);
		});

		it('should pass through ISO duration strings', () => {
			expect(xml).toContain('<Duration>PT0H3M16S</Duration>');
			expect(xml).toContain('<Duration>PT0H3M44S</Duration>');
		});
	});
});
