import { ExecutionPolicy } from '../policies/execution-policy.port';
import { buildClusterProcessCode } from '../policies/process-code.helper';
import { ChannelDeliverySpec, ClusterMember } from './channel-delivery-spec';
import { ChannelTopology } from './channel-topology.enum';

/**
 * Plan spawn channel — quyết định cách 1 distribution nở ra channels khi vào DELIVERING.
 *
 * Bài toán: DIRECT (Spotify) mỗi DSP là 1 channel chạy full process. AGGREGATOR (CI) N DSP
 * dùng chung shared-stages (deliver/ingest/qa/export theo upc/batchId) → gom 1 CLUSTER channel
 * chạy 1 lần, fan-out watcher go-live per-DSP sau. Helper này chỉ CHIA NHÓM (pure), không tạo entity.
 *
 * Cluster chỉ áp cho action=initial (INITIAL/UPDATE). TAKEDOWN giữ per-DSP (ci.takedown) —
 * nhận biết qua processCode kết thúc '.takedown'.
 */

/** 1 direct channel: 1 spec → 1 channel chạy full process của DSP đó. */
export interface DirectSpawnPlan {
	readonly kind: 'direct';
	readonly spec: ChannelDeliverySpec;
}

/** 1 cluster channel: N DSP cùng aggregator → 1 channel shared-stages + members để fan-out. */
export interface ClusterSpawnPlan {
	readonly kind: 'cluster';
	readonly aggregatorCode: string;
	readonly clusterSpec: ChannelDeliverySpec;
	readonly members: ClusterMember[];
}

export type SpawnPlan = DirectSpawnPlan | ClusterSpawnPlan;

/** Có phải action takedown không (không cluster, giữ per-DSP). */
function isTakedown(processCode: string): boolean {
	return processCode.endsWith('.takedown');
}

/**
 * planChannelSpawn — gom channelSpecs thành danh sách SpawnPlan theo thứ tự ổn định.
 *
 * - DIRECT spec → 1 DirectSpawnPlan.
 * - VIA_AGGREGATOR spec (action=initial) → gộp theo aggregatorCode thành 1 ClusterSpawnPlan.
 * - VIA_AGGREGATOR takedown → giữ DirectSpawnPlan (per-DSP ci.takedown, không cluster).
 *
 * processCode mỗi spec resolve qua policy (spec để rỗng tới DELIVERING) — mirror hành vi cũ.
 * Thứ tự plan = thứ tự spec đầu tiên của mỗi nhóm gặp trong mảng (deterministic cho spawnOrder).
 */
export function planChannelSpawn(
	specs: readonly ChannelDeliverySpec[],
	policy: ExecutionPolicy,
): SpawnPlan[] {
	const plans: SpawnPlan[] = [];
	// aggregatorCode → index của ClusterSpawnPlan trong `plans` (giữ thứ tự xuất hiện).
	const clusterIndex = new Map<string, number>();

	for (const spec of specs) {
		const processCode = spec.processCode || policy.resolveProcessCode(spec);

		const isAggregatorCluster =
			spec.topology === ChannelTopology.VIA_AGGREGATOR &&
			!!spec.aggregatorCode &&
			!isTakedown(processCode);

		if (!isAggregatorCluster) {
			// DIRECT, hoặc aggregator-takedown per-DSP: giữ processCode đã resolve trên spec.
			plans.push({ kind: 'direct', spec: { ...spec, processCode } });
			continue;
		}

		const aggregatorCode = spec.aggregatorCode as string;
		const member: ClusterMember = {
			dspCode: spec.dspCode,
			exportMethod: spec.exportMethod,
			hasDeal: spec.hasDeal,
		};

		const existingIdx = clusterIndex.get(aggregatorCode);
		if (existingIdx === undefined) {
			// Tạo cluster mới: 1 clusterSpec đại diện (processCode = '{agg}.cluster.initial').
			const clusterSpec: ChannelDeliverySpec = {
				dspCode: aggregatorCode, // cluster định danh theo aggregator, không phải 1 DSP
				topology: ChannelTopology.VIA_AGGREGATOR,
				processCode: buildClusterProcessCode(aggregatorCode),
				aggregatorCode,
			};
			clusterIndex.set(aggregatorCode, plans.length);
			plans.push({
				kind: 'cluster',
				aggregatorCode,
				clusterSpec,
				members: [member],
			});
		} else {
			(plans[existingIdx] as ClusterSpawnPlan).members.push(member);
		}
	}

	return plans;
}
