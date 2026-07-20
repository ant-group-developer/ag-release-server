import { DspCode } from '../value-objects/dsp-code.vo';

export type DspLiveStatus = 'pending' | 'live' | 'rejected';

/**
 * DeliveryStatusReader — polls the aggregator's `deliver_desire` to reconcile per-DSP live status.
 * Read-mostly, runs in the background (phase 4 adapter).
 *
 * `upc` = the release's UPC/GTIN barcode (e.g., "7316480656310").
 * CI API requires UPC (?gtin=) to look up delivery status — NOT an import batch identifier.
 */
export interface DeliveryStatusReader {
	read(input: {
		upc: string;
		dspCodes: DspCode[];
	}): Promise<Map<string, DspLiveStatus>>;
}
