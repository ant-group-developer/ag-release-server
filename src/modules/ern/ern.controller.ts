import { Controller, Get, Header } from '@nestjs/common';
import { PublicRoute } from '../auth/decorators/auth.decorator';
import { ErnService } from './ern.service';
import { ErnInput } from './interfaces/ern-input.interface';

// ==================== Example Data ====================

const singleExample: ErnInput = {
	version: '4.3',
	message: {
		id: '00001',
		sender: { partyId: 'PADPIDA20250804056', name: 'ANT MUSIC LLC' },
		recipient: { partyId: 'PADPIDA2011072101T', name: 'Spotify' },
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
		coverArt: {
			fileName: '850080651025.jpg',
			filePath: 'resources/',
			codecType: 'JPEG',
			width: 3000,
			height: 3000,
		},
	},
	tracks: [
		{
			isrc: 'QT6KL2500017',
			title: 'Timeless',
			duration: 298,
			order: 1,
			artists: [{ name: 'Fuuji Liam', role: 'MainArtist' }],
			contributors: [{ name: 'Fuuji Liam', role: 'Composer' }],
			pLine: { year: 2025, text: 'AMG, Exclusive Licensed ANT MUSIC' },
			audioFile: {
				fileName: 'QT6KL2500017_T1S.wav',
				filePath: 'resources/',
			},
		},
	],
};

const albumExample: ErnInput = {
	version: '4.3',
	message: {
		id: '00002',
		sender: { partyId: 'PADPIDA20250804056', name: 'ANT MUSIC LLC' },
		recipient: { partyId: 'PADPIDA2011072101T', name: 'Spotify' },
	},
	release: {
		upc: '850080651018',
		title: 'Faith In You',
		type: 'Album',
		releaseDate: '2025-12-20',
		genre: 'Jazz',
		labelName: 'AMG',
		artists: [
			{
				name: 'Donald S. Evans',
				role: 'MainArtist',
				spotifyId: '34nZgjuSy4ogN8SS1tC67n',
			},
		],
		pLine: { year: 2025, text: 'AMG, Exclusive Licensed ANT MUSIC' },
		cLine: { year: 2025, text: 'AMG, Exclusive Licensed ANT MUSIC' },
		coverArt: {
			fileName: '850080651018.jpg',
			filePath: 'resources/',
		},
	},
	tracks: [
		{
			isrc: 'QT6KL2500010',
			title: 'Sensation',
			duration: 'PT0H3M16S',
			order: 1,
			artists: [{ name: 'Donald S. Evans', role: 'MainArtist' }],
			contributors: [{ name: 'Donald S. Evans', role: 'Composer' }],
			audioFile: {
				fileName: 'QT6KL2500010_T1S.wav',
				filePath: 'resources/',
			},
		},
		{
			isrc: 'QT6KL2500011',
			title: 'Faith In You',
			duration: 'PT0H3M44S',
			order: 2,
			artists: [{ name: 'Donald S. Evans', role: 'MainArtist' }],
			contributors: [{ name: 'Donald S. Evans', role: 'Composer' }],
			audioFile: {
				fileName: 'QT6KL2500011_T2S.wav',
				filePath: 'resources/',
			},
		},
	],
};

const ern382Example: ErnInput = {
	version: '3.8.2',
	message: {
		id: '1111',
		threadId: 'R1000001',
		fileName: '4061707105869.xml',
		sender: {
			partyId: 'PADPIDA20250111111',
			name: 'TEST Content Provider',
			isDPID: true,
		},
		recipient: {
			partyId: 'PADPIDA20250111111',
			name: 'Singing Network Technology shanghai CO. LTD.',
			isDPID: true,
		},
		createdDateTime: '2025-11-25T12:43:22+08:00',
		controlType: 'LiveMessage',
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
			languageOfPerformance: 'zh',
			artists: [
				{
					name: 'TEST Artist',
					role: 'MainArtist',
					languageAndScriptCode: 'zh-Hans',
				},
			],
			contributors: [
				{
					name: 'TEST Lyricist',
					role: 'Lyricist',
					languageAndScriptCode: 'zh-Hans',
				},
				{
					name: 'TEST Composer',
					role: 'Composer',
					languageAndScriptCode: 'zh-Hans',
				},
				{
					name: 'TEST Producer',
					role: 'Producer',
					languageAndScriptCode: 'zh-Hans',
				},
			],
			pLine: { year: 2024, text: 'Kanjian Music' },
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
		{
			territories: ['CN', 'US'],
			startDate: '2025-11-25T12:43:22+08:00',
			endDate: '2099-12-31T00:00:00Z',
			commercialModels: ['AdvertisementSupportedModel'],
			useTypes: ['OnDemandStream'],
		},
	],
};

// ==================== Controller ====================

@PublicRoute()
@Controller('ern')
export class ErnController {
	constructor(private readonly ernService: ErnService) {}

	// --- ERN 4.3 ---

	@Get('example/43/single')
	@Header('Content-Type', 'application/xml')
	exampleSingle43() {
		return this.ernService.generate({ ...singleExample, version: '4.3' });
	}

	@Get('example/43/album')
	@Header('Content-Type', 'application/xml')
	exampleAlbum43() {
		return this.ernService.generate({ ...albumExample, version: '4.3' });
	}

	// --- ERN 3.8.2 ---

	@Get('example/382/single')
	@Header('Content-Type', 'application/xml')
	exampleSingle382() {
		return this.ernService.generate({ ...singleExample, version: '3.8.2' });
	}

	@Get('example/382/album')
	@Header('Content-Type', 'application/xml')
	exampleAlbum382() {
		return this.ernService.generate({ ...albumExample, version: '3.8.2' });
	}

	@Get('example/382/full')
	@Header('Content-Type', 'application/xml')
	exampleFull382() {
		return this.ernService.generate(ern382Example);
	}
}
