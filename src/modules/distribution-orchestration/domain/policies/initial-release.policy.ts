import { ChannelDeliverySpec } from '../channel-delivery/channel-delivery-spec';
import { ExecutionTypeEnum } from '../value-objects/execution-type.enum';
import { ExecutionPolicy } from './execution-policy.port';
import { buildProcessCode } from './process-code.helper';

/** INITIAL_RELEASE: provision ids, build+upload, distribute. No retry. */
export class InitialReleasePolicy implements ExecutionPolicy {
	readonly type = ExecutionTypeEnum.INITIAL_RELEASE;
	needsProvisioning(): boolean {
		return true;
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
		return buildProcessCode(spec, 'initial');
	}
}
