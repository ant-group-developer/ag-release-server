import { ErnInput2, ErnVersion2 } from '../interfaces/ern-input.interface';
import { Ern43Builder2 } from './ern43.builder';

describe('Ern43Builder2 video metadata', () => {
	const baseInput: ErnInput2 = {
		version: ErnVersion2.ERN_43,
		message: {
			id: 'MSG-VIDEO-1',
			sender: { partyId: 'PADPIDA20190227007', name: 'ANT MUSIC LLC' },
			recipient: { partyId: 'PADPIDA2014082604G', name: 'Vevo' },
		},
		release: {
			upc: '0850080651804',
			title: 'Video title',
			type: 'VideoSingle',
			releaseDate: '2026-06-04',
			genre: 'Pop',
			labelName: 'AMG',
			artists: [{ name: 'Artist', role: 'MainArtist' }],
		},
		tracks: [],
		videos: [
			{
				isrc: 'QT6KL2614737',
				title: 'Video title',
				duration: 12,
				order: 1,
				artists: [{ name: 'Artist', role: 'MainArtist' }],
				languageOfPerformance: 'ab',
				description: 'ABC, TEST',
				keywords: ['PT', '123'],
				madeForKids: 'NO',
			},
		],
	};

	it('renders VEVO video metadata', () => {
		const xml = new Ern43Builder2(baseInput).build();

		expect(xml).toContain(
			'<LanguageOfPerformance>ab</LanguageOfPerformance>',
		);
		expect(xml).toContain(
			'<Keywords ApplicableTerritoryCode="Worldwide" IsDefault="true">PT,123</Keywords>',
		);
		expect(xml).toContain(
			'<Synopsis ApplicableTerritoryCode="Worldwide" IsDefault="true">ABC, TEST</Synopsis>',
		);
		expect(xml).toContain(
			'<ProprietaryId Namespace="VEVO:MadeForKids">false</ProprietaryId>',
		);
	});

	it('does not override MadeForKids for channel default', () => {
		const input: ErnInput2 = {
			...baseInput,
			videos: [
				{
					...baseInput.videos![0],
					madeForKids: 'CHANNEL_DEFAULT',
				},
			],
		};

		const xml = new Ern43Builder2(input).build();

		expect(xml).not.toContain('VEVO:MadeForKids');
	});
});
