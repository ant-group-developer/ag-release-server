import { parseProcessCode } from '../process-code-resolver';

describe('parseProcessCode', () => {
	describe('DIRECT pattern (2 segments)', () => {
		it('spotify.initial → SPOTIFY, initial, not aggregator', () => {
			const result = parseProcessCode('spotify.initial');
			expect(result).toEqual({
				dspRoute: 'SPOTIFY',
				action: 'initial',
				isAggregator: false,
				rawCode: 'spotify.initial',
			});
		});

		it('vevo.takedown → VEVO, takedown, not aggregator', () => {
			const result = parseProcessCode('vevo.takedown');
			expect(result).toEqual({
				dspRoute: 'VEVO',
				action: 'takedown',
				isAggregator: false,
				rawCode: 'vevo.takedown',
			});
		});

		it('APPLE_MUSIC.initial → APPLE_MUSIC (preserves case in route)', () => {
			const result = parseProcessCode('APPLE_MUSIC.initial');
			expect(result.dspRoute).toBe('APPLE_MUSIC');
			expect(result.action).toBe('initial');
		});
	});

	describe('VIA_AGGREGATOR pattern (3 segments)', () => {
		it('ci.deal.initial → CI, initial, aggregator', () => {
			const result = parseProcessCode('ci.deal.initial');
			expect(result).toEqual({
				dspRoute: 'CI',
				action: 'initial',
				isAggregator: true,
				rawCode: 'ci.deal.initial',
			});
		});

		it('ci.state51.initial → CI, initial, aggregator', () => {
			const result = parseProcessCode('ci.state51.initial');
			expect(result).toEqual({
				dspRoute: 'CI',
				action: 'initial',
				isAggregator: true,
				rawCode: 'ci.state51.initial',
			});
		});
	});

	describe('VIA_AGGREGATOR takedown (2 segments, known aggregator)', () => {
		it('ci.takedown → CI, takedown, aggregator (known code)', () => {
			const result = parseProcessCode('ci.takedown');
			expect(result).toEqual({
				dspRoute: 'CI',
				action: 'takedown',
				isAggregator: true,
				rawCode: 'ci.takedown',
			});
		});
	});

	describe('error cases', () => {
		it('single segment → throw', () => {
			expect(() => parseProcessCode('spotify')).toThrow(
				/expected 2-3 dot-separated segments/,
			);
		});

		it('4 segments → throw', () => {
			expect(() => parseProcessCode('ci.deal.initial.extra')).toThrow(
				/expected 2-3 dot-separated segments/,
			);
		});

		it('invalid action → throw', () => {
			expect(() => parseProcessCode('spotify.update')).toThrow(
				/expected "initial" or "takedown"/,
			);
		});
	});
});
