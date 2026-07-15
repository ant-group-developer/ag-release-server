import { ChannelDeliverySpec } from '../channel-delivery/channel-delivery-spec';
import { ChannelTopology } from '../channel-delivery/channel-topology.enum';
import { ExecutionTypeEnum } from '../value-objects/execution-type.enum';
import { ExecutionPolicy } from './execution-policy.port';
import { buildProcessCode } from './process-code.helper';

/**
 * TAKEDOWN: no provisioning, no build/upload — runs the takedown process straight into DELIVERING.
 * Direct DSPs are chosen individually; aggregator channels take down the whole cluster.
 */
export class TakedownPolicy implements ExecutionPolicy {
	readonly type = ExecutionTypeEnum.TAKEDOWN;
	needsProvisioning(): boolean {
		return false;
	}
	needsBuildAndUpload(): boolean {
		return false;
	}
	canRetry(): boolean {
		return false;
	}
	terminalIntent(): 'DISTRIBUTED' | 'TAKEN_DOWN' {
		return 'TAKEN_DOWN';
	}
	resolveProcessCode(spec: ChannelDeliverySpec): string {
		return buildProcessCode(spec, 'takedown');
	}
	selectChannelsForTakedown(all: ChannelDeliverySpec[]): ChannelDeliverySpec[] {
		// aggregator takes down the whole cluster; direct are already per-DSP picks upstream.
		// here we simply pass through — the application decides which direct DSPs were selected.
		return all.filter(
			(s) =>
				s.topology === ChannelTopology.DIRECT ||
				s.topology === ChannelTopology.VIA_AGGREGATOR,
		);
	}
}
