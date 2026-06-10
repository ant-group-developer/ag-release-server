import { ern382Example, singleExample } from '../ern-example.data';
import { ErnInput2, ErnVersion2 } from '../interfaces/ern-input.interface';
import { Ern382Builder2 } from './ern382.builder';
import { Ern43Builder2 } from './ern43.builder';

describe('instrumental track metadata', () => {
	it('renders IsInstrumental and omits LanguageOfPerformance in ERN 4.3', () => {
		const input: ErnInput2 = {
			...singleExample,
			version: ErnVersion2.ERN_43,
			tracks: [
				{
					...singleExample.tracks[0],
					isInstrumental: true,
					languageOfPerformance: 'zxx',
				},
			],
		};

		const xml = new Ern43Builder2(input).build();

		expect(xml).toContain('<IsInstrumental>true</IsInstrumental>');
		expect(xml).not.toContain('<LanguageOfPerformance>');
	});

	it('renders IsInstrumental and omits LanguageOfPerformance in ERN 3.8.2', () => {
		const input: ErnInput2 = {
			...ern382Example,
			tracks: [
				{
					...ern382Example.tracks[0],
					isInstrumental: true,
					languageOfPerformance: 'zxx',
				},
			],
		};

		const xml = new Ern382Builder2(input).build();

		expect(xml).toContain('<IsInstrumental>true</IsInstrumental>');
		expect(xml).not.toContain('<LanguageOfPerformance>');
	});
});
