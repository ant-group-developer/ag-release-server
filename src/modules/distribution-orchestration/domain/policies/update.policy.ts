import { ChannelDeliverySpec } from '../channel-delivery/channel-delivery-spec';
import { ExecutionTypeEnum } from '../value-objects/execution-type.enum';
import { ExecutionPolicy } from './execution-policy.port';
import { buildProcessCode } from './process-code.helper';

/**
 * UPDATE: ids already exist → skip provisioning (but still pass PROVISIONING_IDS as a no-op).
 * Re-build + re-deliver using the SAME distribution process as INITIAL. No retry.
 */
export class UpdatePolicy implements ExecutionPolicy {
	readonly type = ExecutionTypeEnum.UPDATE;
	needsProvisioning(): boolean {
		return false;
	}
	needsBuildAndUpload(): boolean {
		return true;
	}
	canRetry(): boolean {
		return false;
	}
	terminalIntent(): 'DISTRIBUTED' | 'TAKEN_DOWN' {
		return 'DISTRIBUTED';
	}
	resolveProcessCode(spec: ChannelDeliverySpec): string {
		return buildProcessCode(spec, 'initial'); // reuse the distribution flow
	}
}
