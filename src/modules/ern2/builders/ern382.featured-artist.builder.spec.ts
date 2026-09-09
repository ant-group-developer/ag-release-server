import { ern382Example } from '../ern-example.data';
import { Ern382Builder2 } from './ern382.builder';

describe('Ern382Builder2 release featured artists', () => {
	it('renders featured artists in the main release name and artist list', () => {
		const input = {
			...ern382Example,
			release: {
				...ern382Example.release,
				artists: [{ name: 'Tia', role: 'MainArtist' as const }],
				contributors: [
					{ name: 'BhadBoi OML', role: 'FeaturedArtist' as const },
				],
			},
		};

		const xml = new Ern382Builder2(input).build();
		const mainReleaseXml = xml.slice(
			xml.indexOf('<ReleaseReference>R0</ReleaseReference>'),
		);

		expect(mainReleaseXml).toContain(
			'<DisplayArtistName>Tia feat. BhadBoi OML</DisplayArtistName>',
		);
		expect(mainReleaseXml).toMatch(
			/<FullName>BhadBoi OML<\/FullName>[\s\S]*?<ArtistRole>FeaturedArtist<\/ArtistRole>/,
		);
	});
});
