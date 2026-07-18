import { DspCode } from '../value-objects/dsp-code.vo';

export type DspLiveStatus = 'pending' | 'live' | 'rejected';

/**
 * DeliveryStatusReader — polls the aggregator's `deliver_desire` to reconcile per-DSP live status.
 * Read-mostly, runs in the background (phase 4 adapter).
 */
export interface DeliveryStatusReader {
	read(input: {
		batchId: string;
		dspCodes: DspCode[];
	}): Promise<Map<string, DspLiveStatus>>;
}
