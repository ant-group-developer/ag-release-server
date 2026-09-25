import { ern382Example } from '../ern-example.data';
import { ErnInput2 } from '../interfaces/ern-input.interface';
import { Ern382Builder2 } from './ern382.builder';

describe('Ern382Builder2 price information', () => {
	it('renders PriceRangeType and PriceType for PermanentDownload deal', () => {
		const input: ErnInput2 = {
			...ern382Example,
			deals: {
				release: [
					{
						...ern382Example.deals!.release[0],
						useTypes: ['PermanentDownload'],
						price: {
							priceType: 'StandardRetailPrice',
							value: 6.99,
							currencyCode: 'USD',
							priceRangeType: 'premium',
						},
					},
				],
				tracks: [],
			},
		};

		const xml = new Ern382Builder2(input).build();

		expect(xml).toContain(
			'<PriceRangeType Namespace="DPID:PADPIDA20250111111">premium</PriceRangeType>',
		);
		expect(xml).toContain(
			'<PriceType Namespace="PADPIDA20250111111">premium</PriceType>',
		);
	});

	it('does NOT render PriceType for streaming deals', () => {
		const input: ErnInput2 = {
			...ern382Example,
			deals: {
				release: [],
				tracks: [
					[
						{
							...ern382Example.deals!.tracks![0][0],
							useTypes: ['Stream'],
							price: {
								priceType: 'StandardRetailPrice',
								value: 0,
								currencyCode: 'USD',
								priceRangeType: 'mid',
							},
						},
					],
				],
			},
		};

		const xml = new Ern382Builder2(input).build();

		expect(xml).toContain(
			'<PriceRangeType Namespace="DPID:PADPIDA20250111111">mid</PriceRangeType>',
		);
		expect(xml).not.toContain('<PriceType');
	});
});
