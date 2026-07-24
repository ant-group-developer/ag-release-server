import { ChannelDeliverySpec } from '../../domain/channel-delivery/channel-delivery-spec';

export const DSP_SPEC_RESOLVER = Symbol('DspSpecResolver');

/**
 * DspSpecResolver — resolve danh sách DSP code → ChannelDeliverySpec[] khi submit.
 *
 * Client chỉ gửi dspCodes[]; server derive topology/aggregatorCode/hasDeal/exportMethod
 * từ DspRoutingConfig + Dsp (config data dùng chung, không phải pipeline v3).
 * processCode để trống — aggregate tự fill qua policy.resolveProcessCode(spec).
 */
export interface DspSpecResolver {
	/**
	 * @throws nếu 1 DSP code không có routing config active (message nêu rõ code).
	 */
	resolveMany(dspCodes: string[]): Promise<ChannelDeliverySpec[]>;
}
