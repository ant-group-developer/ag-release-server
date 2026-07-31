import { ChannelTopology } from './channel-topology.enum';

/**
 * ExportMethod — how to export for an aggregator (picks the mechanism in the Exporter port, does NOT drive state).
 * CI_DEAL = export via admin panel (Dsp.hasDeal=true); STATE51 = email batch (hasDeal=false).
 */
export type ExportMethod = 'CI_DEAL' | 'STATE51';

/**
 * ChannelDeliverySpec — the config for one channel in one distribution (input to spawn a ChannelDelivery).
 *
 * This is CONFIG DATA: picks the `processCode` + which adapter runs the ACTION stages.
 * Does NOT drive transitions — the flow is decided by the DeliveryProcess (via processCode).
 * `topology`/`aggregatorCode`/`exportMethod`/`hasDeal` only help the policy pick a process + adapter.
 */
export interface ChannelDeliverySpec {
	readonly dspCode: string; // DSP code (SPOTIFY, VEVO, CI…)
	readonly topology: ChannelTopology; // UI grouping metadata
	readonly processCode: string; // a code in the registry (chosen by policy.resolveProcessCode)
	readonly aggregatorCode?: string; // 'CI'… (VIA_AGGREGATOR only)
	readonly exportMethod?: ExportMethod; // VIA_AGGREGATOR only
	readonly hasDeal?: boolean; // per-DSP (Dsp.hasDeal) — separates CI deal vs State51
}

/**
 * ClusterMember — 1 DSP con trong 1 CI cluster channel.
 *
 * Cluster gom N DSP cùng aggregator chạy shared-stages (deliver/ingest/qa/export) 1 lần.
 * Mỗi member giữ đủ thông tin để: (1) fan-out watcher go-live per-DSP, (2) export theo
 * distinct exportMethod (deal→no-op, state51→email). dspCode = định danh watcher + projection.
 */
export interface ClusterMember {
	readonly dspCode: string;
	readonly exportMethod?: ExportMethod;
	readonly hasDeal?: boolean;
}
