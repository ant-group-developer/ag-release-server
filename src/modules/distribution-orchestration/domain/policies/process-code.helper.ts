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

/**
 * buildClusterProcessCode — process code cho 1 CI CLUSTER channel (shared-stages N DSP).
 *
 * Cụm gom mọi DSP cùng aggregator (bất kể deal/state51) → 1 process cluster chạy
 * deliver/ingest/qa/export MỘT LẦN. Lane (deal/state51) KHÔNG vào process cluster — nó chỉ
 * ảnh hưởng stage export (distinct-method), xử lý qua members. VD 'ci.cluster.initial'.
 */
export function buildClusterProcessCode(
	aggregatorCode: string,
	suffix: 'initial' = 'initial',
): string {
	return `${aggregatorCode.toLowerCase()}.cluster.${suffix}`;
}

/** Process code cho 1 go-live watcher per-DSP (spawn sau khi cluster shared xong). */
export function buildGoliveProcessCode(): string {
	return 'ci.golive';
}
