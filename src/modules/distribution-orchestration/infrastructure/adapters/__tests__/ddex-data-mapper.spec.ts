import { ErnVersion2 } from '../../../../ern2/interfaces/ern-input.interface';
import {
	DdexBuildConfig,
	mapSnapshotToErnInput,
	ReleaseSnapshotPayload,
} from '../ddex-data-mapper';

const MINIMAL_SNAPSHOT: ReleaseSnapshotPayload = {
	id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
	upc: '0123456789012',
	title: 'Test Album',
	releaseDate: '2026-07-20T00:00:00Z',
	albumFormat: { code: 'Album' },
	primaryGenre: { name: 'Pop' },
	label: { name: 'Test Label' },
	pLineYear: 2026,
	pLineOwner: 'Test Label',
	cLineYear: 2026,
	cLineOwner: 'Test Label',
	priceTier: { amount: 9.99, currency: { code: 'USD' }, ciCode: 'A01' },
	releaseArtists: [{ artist: { name: 'Test Artist' } }],
	releaseCoverArts: [
		{ file: { extension: 'jpg' }, width: 3000, height: 3000 },
	],
	tracks: [
		{
			isrc: 'USTEST0000001',
			title: 'Track One',
			order: 1,
			primaryGenre: { name: 'Pop' },
			trackArtists: [{ artist: { name: 'Test Artist' } }],
			trackContributors: [
				{
					artist: { name: 'Producer Guy' },
					artistRole: { code: 'Producer' },
				},
			],
			pLineYear: 2026,
			pLineOwner: 'Test Label',
			priceTier: {
				amount: 1.29,
				currency: { code: 'USD' },
				ciCode: 'T01',
			},
			audioFile: {
				duration: 210,
				file: { extension: 'wav' },
				bitrate: 1411,
				sampleRate: '44100',
				bitDepth: 16,
			},
		},
		{
			isrc: 'USTEST0000002',
			title: 'Track Two',
			order: 2,
			isInstrumental: true,
			trackArtists: [{ artist: { name: 'Test Artist' } }],
			priceTier: {
				amount: 1.29,
				currency: { code: 'USD' },
				ciCode: 'T01',
			},
			audioFile: {
				duration: 180,
				file: { extension: 'flac' },
			},
		},
	],
};

const BUILD_CONFIG: DdexBuildConfig = {
	ernVersion: ErnVersion2.ERN_43,
	sender: { partyId: 'PADPIDA2026', name: 'Test Sender' },
	recipient: { partyId: 'PADPIDA2027', name: 'CI Recipient' },
};

describe('mapSnapshotToErnInput', () => {
	it('maps minimal snapshot to valid ErnInput2', () => {
		const result = mapSnapshotToErnInput(MINIMAL_SNAPSHOT, BUILD_CONFIG);

		expect(result.version).toBe(ErnVersion2.ERN_43);
		expect(result.message.id).toBe('0123456789012');
		expect(result.message.sender.partyId).toBe('PADPIDA2026');
		expect(result.message.recipient.partyId).toBe('PADPIDA2027');
	});

	it('maps release metadata correctly', () => {
		const result = mapSnapshotToErnInput(MINIMAL_SNAPSHOT, BUILD_CONFIG);

		expect(result.release.upc).toBe('0123456789012');
		expect(result.release.title).toBe('Test Album');
		expect(result.release.type).toBe('Album');
		expect(result.release.genre).toBe('Pop');
		expect(result.release.labelName).toBe('Test Label');
		expect(result.release.releaseDate).toBe('2026-07-20');
	});

	it('maps release artists', () => {
		const result = mapSnapshotToErnInput(MINIMAL_SNAPSHOT, BUILD_CONFIG);

		expect(result.release.artists).toHaveLength(1);
		expect(result.release.artists[0]).toEqual({
			name: 'Test Artist',
			role: 'MainArtist',
			spotifyId: undefined,
			appleMusicId: undefined,
		});
	});

	it('maps pLine and cLine', () => {
		const result = mapSnapshotToErnInput(MINIMAL_SNAPSHOT, BUILD_CONFIG);

		expect(result.release.pLine).toEqual({
			year: 2026,
			text: '2026 Test Label',
		});
		expect(result.release.cLine).toEqual({
			year: 2026,
			text: '2026 Test Label',
		});
	});

	it('maps tracks sorted by order', () => {
		const result = mapSnapshotToErnInput(MINIMAL_SNAPSHOT, BUILD_CONFIG);

		expect(result.tracks).toHaveLength(2);
		expect(result.tracks[0].isrc).toBe('USTEST0000001');
		expect(result.tracks[0].title).toBe('Track One');
		expect(result.tracks[1].isrc).toBe('USTEST0000002');
	});

	it('handles instrumental track (no languageOfPerformance)', () => {
		const result = mapSnapshotToErnInput(MINIMAL_SNAPSHOT, BUILD_CONFIG);

		// Track 2 is instrumental
		expect(result.tracks[1].isInstrumental).toBe(true);
		expect(result.tracks[1].languageOfPerformance).toBeUndefined();
	});

	it('maps non-instrumental track with language', () => {
		const result = mapSnapshotToErnInput(MINIMAL_SNAPSHOT, BUILD_CONFIG);

		// Track 1 is not instrumental — should have languageOfPerformance
		expect(result.tracks[0].isInstrumental).toBeUndefined();
		expect(result.tracks[0].languageOfPerformance).toBe('zxx'); // no linguistic content
	});

	it('maps track contributors', () => {
		const result = mapSnapshotToErnInput(MINIMAL_SNAPSHOT, BUILD_CONFIG);

		expect(result.tracks[0].contributors).toHaveLength(1);
		expect(result.tracks[0].contributors![0]).toEqual({
			name: 'Producer Guy',
			role: 'Producer',
		});
	});

	it('maps audio file metadata', () => {
		const result = mapSnapshotToErnInput(MINIMAL_SNAPSHOT, BUILD_CONFIG);

		expect(result.tracks[0].audioFile).toEqual({
			fileName: 'USTEST0000001_T0S.wav',
			filePath: 'resources',
			codecType: 'WAV',
			bitRate: 1411,
			samplingRate: 44100,
			bitDepth: 16,
		});
	});

	it('maps deals (release + 3 track deals)', () => {
		const result = mapSnapshotToErnInput(MINIMAL_SNAPSHOT, BUILD_CONFIG);

		expect(result.deals!.release).toHaveLength(1);
		expect(result.deals!.tracks).toHaveLength(3);
		expect(result.deals!.release[0].commercialModels).toContain(
			'PayAsYouGoModel',
		);
		expect(result.deals!.tracks![0].useTypes).toContain(
			'PermanentDownload',
		);
		expect(result.deals!.tracks![1].useTypes).toContain('Stream');
	});

	it('maps cover art metadata', () => {
		const result = mapSnapshotToErnInput(MINIMAL_SNAPSHOT, BUILD_CONFIG);

		expect(result.release.coverArt).toEqual({
			fileName: '0123456789012.jpg',
			filePath: 'resources',
			codecType: 'JPEG',
			width: 3000,
			height: 3000,
		});
	});

	it('defaults territory to Worldwide when no territory config', () => {
		const result = mapSnapshotToErnInput(MINIMAL_SNAPSHOT, BUILD_CONFIG);

		expect(result.release.territories).toEqual(['Worldwide']);
	});

	it('respects DISTRIBUTE_ONLY_IN territory', () => {
		const snapshot: ReleaseSnapshotPayload = {
			...MINIMAL_SNAPSHOT,
			releaseTerritory: {
				distributionType: 'DISTRIBUTE_ONLY_IN',
				selectedCountries: ['US', 'GB', 'JP'],
			},
		};
		const result = mapSnapshotToErnInput(snapshot, BUILD_CONFIG);

		expect(result.release.territories).toEqual(['US', 'GB', 'JP']);
	});
});
