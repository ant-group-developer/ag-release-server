import {
	DeliveryStatusReader,
	DspLiveStatus,
} from '../../domain/ports/delivery-status-reader.port';
import { DspCode } from '../../domain/value-objects/dsp-code.vo';

/**
 * InMemoryDeliveryStatusReader — test double cho DeliveryStatusReader.
 * Mặc định 'pending' cho DSP chưa set. `setStatus()` mô phỏng aggregator cập nhật live/rejected.
 */
export class InMemoryDeliveryStatusReader implements DeliveryStatusReader {
	private readonly statusByUpc = new Map<
		string,
		Map<string, DspLiveStatus>
	>();

	setStatus(upc: string, dspCode: string, status: DspLiveStatus): void {
		const perUpc =
			this.statusByUpc.get(upc) ?? new Map<string, DspLiveStatus>();
		perUpc.set(dspCode, status);
		this.statusByUpc.set(upc, perUpc);
	}

	async read(input: {
		upc: string;
		dspCodes: DspCode[];
	}): Promise<Map<string, DspLiveStatus>> {
		const stored = this.statusByUpc.get(input.upc);
		const result = new Map<string, DspLiveStatus>();
		for (const dsp of input.dspCodes) {
			result.set(dsp.value, stored?.get(dsp.value) ?? 'pending');
		}
		return result;
	}
}
