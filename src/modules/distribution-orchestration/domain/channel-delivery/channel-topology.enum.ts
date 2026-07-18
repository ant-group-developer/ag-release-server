/**
 * ChannelTopology — channel grouping METADATA (UI label + a hint for the default process).
 *
 * ⚠ Does NOT drive transitions. The channel flow is decided by `DeliveryProcess` (data),
 * not by topology. Mapped from v3 `RoutingModeEnum` (DIRECT/AGGREGATOR/SYSTEM):
 *   DIRECT     → DIRECT (direct DSP: Spotify, Vevo…)
 *   AGGREGATOR → VIA_AGGREGATOR (via CI…)
 *   SYSTEM     → (not used in orchestration yet; map when needed)
 */
export enum ChannelTopology {
	DIRECT = 'DIRECT',
	VIA_AGGREGATOR = 'VIA_AGGREGATOR',
}
