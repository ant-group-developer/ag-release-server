import { ChannelDeliverySpec } from '../channel-delivery/channel-delivery-spec';
import { ChannelTopology } from '../channel-delivery/channel-topology.enum';

/**
 * buildProcessCode — derives a registry process code from a channel spec + a suffix.
 *
 * Prefix rules (data-driven, from the spec fields — NOT hardcoded per DSP):
 *   DIRECT           → '{dspCode-lowercased}'      e.g. 'spotify'
 *   VIA_AGGREGATOR   → '{aggregator}.{deal|state51}' e.g. 'ci.deal' or 'ci.state51'
 * Suffix is the flow direction: 'initial' (distribute) or 'takedown'.
 *   → 'spotify.initial' · 'ci.deal.initial' · 'ci.takedown'
 */
export function buildProcessCode(
	spec: ChannelDeliverySpec,
	suffix: 'initial' | 'takedown',
): string {
	if (spec.topology === ChannelTopology.DIRECT) {
		return `${spec.dspCode.toLowerCase()}.${suffix}`;
	}

	// VIA_AGGREGATOR
	const agg = (spec.aggregatorCode ?? 'ci').toLowerCase();
	if (suffix === 'takedown') {
		// aggregator takedown does not split deal vs state51 — one cluster takedown
		return `${agg}.takedown`;
	}
	const lane = spec.hasDeal ? 'deal' : 'state51';
	return `${agg}.${lane}.${suffix}`;
}
