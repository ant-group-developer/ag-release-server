import { ChannelDeliverySpec } from '../channel-delivery/channel-delivery-spec';
import { ExecutionTypeEnum } from '../value-objects/execution-type.enum';
import { ExecutionPolicy } from './execution-policy.port';

/**
 * RETRY is NOT a standalone release type — it WRAPS the original distribution's policy and
 * only flips canRetry() to true. resetForRetry() uses it to legitimize resetting a subtree.
 *
 * ⚠ Named RetryExecutionPolicy to avoid clashing with the VO `RetryPolicy` (SFTP backoff).
 * Everything else delegates to the wrapped policy (spec §7.3).
 */
export class RetryExecutionPolicy implements ExecutionPolicy {
	readonly type = ExecutionTypeEnum.RETRY;

	constructor(private readonly inner: ExecutionPolicy) {}

	needsProvisioning(): boolean {
		return this.inner.needsProvisioning();
	}
	needsBuildAndUpload(): boolean {
		return this.inner.needsBuildAndUpload();
	}
	canRetry(): boolean {
		return true;
	}
	terminalIntent(): 'DISTRIBUTED' | 'TAKEN_DOWN' {
		return this.inner.terminalIntent();
	}
	resolveProcessCode(spec: ChannelDeliverySpec): string {
		return this.inner.resolveProcessCode(spec);
	}
	selectChannelsForTakedown(
		all: ChannelDeliverySpec[],
	): ChannelDeliverySpec[] {
		return this.inner.selectChannelsForTakedown?.(all) ?? all;
	}
}
