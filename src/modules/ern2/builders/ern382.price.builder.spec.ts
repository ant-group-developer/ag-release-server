import { ern382Example } from '../ern-example.data';
import { ErnInput2 } from '../interfaces/ern-input.interface';
import { Ern382Builder2 } from './ern382.builder';

describe('Ern382Builder2 price information', () => {
	it('renders PriceRangeType from deal price value', () => {
		const input: ErnInput2 = {
			...ern382Example,
			deals: {
				release: [
					{
						...ern382Example.deals!.release![0],
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
	});
});
