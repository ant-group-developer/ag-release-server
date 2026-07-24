import { BadRequestException, Injectable } from '@nestjs/common';

import { DspRoutingConfigsService } from 'src/modules/distribution/dsp-routing/services/dsp-routing-config.service';
import { RoutingModeEnum } from 'src/modules/distribution/dsp-routing/enum/dsp-routing.enum';
import { DspSpecResolver } from '../../application/ports/dsp-spec-resolver.port';
import {
	ChannelDeliverySpec,
	ExportMethod,
} from '../../domain/channel-delivery/channel-delivery-spec';
import { ChannelTopology } from '../../domain/channel-delivery/channel-topology.enum';

/**
 * DspSpecResolverAdapter — resolve dspCodes[] → ChannelDeliverySpec[] qua DspRoutingConfig.
 *
 * Mapping (verify từ resolveRawDeliveryConfig):
 *   mode direct              → DIRECT (no aggregator)
 *   mode aggregator|system   → VIA_AGGREGATOR + aggregatorCode + exportMethod theo hasDeal
 *   exportMethod: hasDeal → CI_DEAL, else STATE51 (chỉ VIA_AGGREGATOR)
 *   processCode: để trống — aggregate fill qua policy.resolveProcessCode(spec).
 */
@Injectable()
export class DspSpecResolverAdapter implements DspSpecResolver {
	constructor(
		private readonly routingService: DspRoutingConfigsService,
	) {}

	async resolveMany(dspCodes: string[]): Promise<ChannelDeliverySpec[]> {
		const unique = [...new Set(dspCodes)];
		return Promise.all(unique.map((code) => this.resolveOne(code)));
	}

	private async resolveOne(dspCode: string): Promise<ChannelDeliverySpec> {
		let routing;
		try {
			routing = await this.routingService.resolveRawDeliveryConfig(dspCode);
		} catch {
			throw new BadRequestException(
				`DSP "${dspCode}" chưa có cấu hình routing active`,
			);
		}

		const isDirect = routing.mode === RoutingModeEnum.DIRECT;
		const hasDeal = routing.dsp?.hasDeal ?? false;

		if (isDirect) {
			return {
				dspCode,
				topology: ChannelTopology.DIRECT,
				processCode: '', // aggregate fill qua policy
			};
		}

		// aggregator | system → VIA_AGGREGATOR
		const exportMethod: ExportMethod = hasDeal ? 'CI_DEAL' : 'STATE51';
		return {
			dspCode,
			topology: ChannelTopology.VIA_AGGREGATOR,
			processCode: '',
			aggregatorCode: routing.aggregator?.code ?? undefined,
			exportMethod,
			hasDeal,
		};
	}
}
