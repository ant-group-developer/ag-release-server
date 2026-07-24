import { BadRequestException } from '@nestjs/common';

import { RoutingModeEnum } from 'src/modules/distribution/dsp-routing/enum/dsp-routing.enum';
import { ChannelTopology } from '../../../domain/channel-delivery/channel-topology.enum';
import { DspSpecResolverAdapter } from '../dsp-spec-resolver.adapter';

/**
 * Unit test DspSpecResolverAdapter — map DSP code → ChannelDeliverySpec qua DspRoutingConfig.
 */
describe('DspSpecResolverAdapter', () => {
	function makeAdapter(
		routingByCode: Record<string, unknown>,
	) {
		const routingService = {
			resolveRawDeliveryConfig: jest.fn(async (code: string) => {
				const r = routingByCode[code];
				if (!r) throw new Error('NOT_FOUND');
				return r;
			}),
		};
		return new DspSpecResolverAdapter(routingService as never);
	}

	it('DIRECT → topology DIRECT, không aggregator', async () => {
		const adapter = makeAdapter({
			SPOTIFY: {
				mode: RoutingModeEnum.DIRECT,
				dsp: { hasDeal: false },
				aggregator: null,
			},
		});

		const [spec] = await adapter.resolveMany(['SPOTIFY']);

		expect(spec).toMatchObject({
			dspCode: 'SPOTIFY',
			topology: ChannelTopology.DIRECT,
			processCode: '',
		});
		expect(spec.aggregatorCode).toBeUndefined();
	});

	it('AGGREGATOR + hasDeal → VIA_AGGREGATOR, CI_DEAL', async () => {
		const adapter = makeAdapter({
			VEVO: {
				mode: RoutingModeEnum.AGGREGATOR,
				dsp: { hasDeal: true },
				aggregator: { code: 'CI' },
			},
		});

		const [spec] = await adapter.resolveMany(['VEVO']);

		expect(spec).toMatchObject({
			dspCode: 'VEVO',
			topology: ChannelTopology.VIA_AGGREGATOR,
			aggregatorCode: 'CI',
			exportMethod: 'CI_DEAL',
			hasDeal: true,
		});
	});

	it('AGGREGATOR không hasDeal → STATE51', async () => {
		const adapter = makeAdapter({
			TIKTOK: {
				mode: RoutingModeEnum.AGGREGATOR,
				dsp: { hasDeal: false },
				aggregator: { code: 'CI' },
			},
		});

		const [spec] = await adapter.resolveMany(['TIKTOK']);
		expect(spec.exportMethod).toBe('STATE51');
	});

	it('SYSTEM mode → VIA_AGGREGATOR theo hasDeal', async () => {
		const adapter = makeAdapter({
			X: {
				mode: RoutingModeEnum.SYSTEM,
				dsp: { hasDeal: true },
				aggregator: { code: 'CI' },
			},
		});
		const [spec] = await adapter.resolveMany(['X']);
		expect(spec.topology).toBe(ChannelTopology.VIA_AGGREGATOR);
		expect(spec.exportMethod).toBe('CI_DEAL');
	});

	it('DSP không có routing → BadRequestException', async () => {
		const adapter = makeAdapter({});
		await expect(adapter.resolveMany(['UNKNOWN'])).rejects.toThrow(
			BadRequestException,
		);
	});

	it('dedupe codes trùng', async () => {
		const adapter = makeAdapter({
			SPOTIFY: {
				mode: RoutingModeEnum.DIRECT,
				dsp: { hasDeal: false },
				aggregator: null,
			},
		});
		const specs = await adapter.resolveMany(['SPOTIFY', 'SPOTIFY']);
		expect(specs).toHaveLength(1);
	});
});
