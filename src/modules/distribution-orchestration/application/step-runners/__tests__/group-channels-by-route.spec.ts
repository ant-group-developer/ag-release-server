import { ChannelDeliverySpec } from '../../../domain/channel-delivery/channel-delivery-spec';
import { ChannelTopology } from '../../../domain/channel-delivery/channel-topology.enum';
import { InitialReleasePolicy } from '../../../domain/policies/initial-release.policy';
import {
	groupChannelsByRoute,
	groupKeyOf,
} from '../group-channels-by-route';

/**
 * groupChannelsByRoute — gom channel theo dspRoute để build 1 package/nhóm.
 * Trọng tâm: Spotify direct tách riêng, Apple+Facebook qua CI gộp 1 nhóm.
 */
describe('groupChannelsByRoute', () => {
	const policy = new InitialReleasePolicy();

	const spec = (over: Partial<ChannelDeliverySpec>): ChannelDeliverySpec => ({
		dspCode: 'SPOTIFY',
		topology: ChannelTopology.DIRECT,
		processCode: '',
		...over,
	});

	describe('groupKeyOf', () => {
		it('DIRECT → dspCode viết hoa', () => {
			expect(groupKeyOf('spotify.initial')).toBe('SPOTIFY');
		});
		it('AGGREGATOR deal/state51 → aggregator code (cùng nhóm)', () => {
			expect(groupKeyOf('ci.deal.initial')).toBe('CI');
			expect(groupKeyOf('ci.state51.initial')).toBe('CI');
		});
		it('throws khi processCode rỗng', () => {
			expect(() => groupKeyOf('')).toThrow(/invalid processCode/);
		});
	});

	it('3 DSP (Spotify + Apple/CI + Facebook/CI) → 2 nhóm SPOTIFY + CI', () => {
		const groups = groupChannelsByRoute(
			[
				spec({ dspCode: 'SPOTIFY', topology: ChannelTopology.DIRECT }),
				spec({
					dspCode: 'APPLE',
					topology: ChannelTopology.VIA_AGGREGATOR,
					aggregatorCode: 'CI',
					hasDeal: false, // state51
				}),
				spec({
					dspCode: 'FACEBOOK',
					topology: ChannelTopology.VIA_AGGREGATOR,
					aggregatorCode: 'CI',
					hasDeal: true, // deal
				}),
			],
			policy,
		);

		expect(groups).toHaveLength(2);

		const spotify = groups.find((g) => g.groupKey === 'SPOTIFY');
		expect(spotify?.processCode).toBe('spotify.initial');
		expect(spotify?.dspCodes).toEqual(['SPOTIFY']);

		const ci = groups.find((g) => g.groupKey === 'CI');
		// processCode đại diện = channel CI đầu tiên (Apple/state51). Lane không ảnh hưởng build.
		expect(ci?.processCode).toBe('ci.state51.initial');
		expect(ci?.dspCodes).toEqual(['APPLE', 'FACEBOOK']);
	});

	it('dùng spec.processCode có sẵn thay vì resolve qua policy', () => {
		const groups = groupChannelsByRoute(
			[spec({ dspCode: 'VEVO', processCode: 'vevo.initial' })],
			policy,
		);
		expect(groups).toEqual([
			{ groupKey: 'VEVO', processCode: 'vevo.initial', dspCodes: ['VEVO'] },
		]);
	});

	it('throws khi specs rỗng', () => {
		expect(() => groupChannelsByRoute([], policy)).toThrow(
			/empty channelSpecs/,
		);
	});
});
