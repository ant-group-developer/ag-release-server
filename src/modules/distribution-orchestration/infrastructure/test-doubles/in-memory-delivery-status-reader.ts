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
	private readonly statusByBatch = new Map<
		string,
		Map<string, DspLiveStatus>
	>();

	setStatus(batchId: string, dspCode: string, status: DspLiveStatus): void {
		const perBatch =
			this.statusByBatch.get(batchId) ?? new Map<string, DspLiveStatus>();
		perBatch.set(dspCode, status);
		this.statusByBatch.set(batchId, perBatch);
	}

	async read(input: {
		batchId: string;
		dspCodes: DspCode[];
	}): Promise<Map<string, DspLiveStatus>> {
		const stored = this.statusByBatch.get(input.batchId);
		const result = new Map<string, DspLiveStatus>();
		for (const dsp of input.dspCodes) {
			result.set(dsp.value, stored?.get(dsp.value) ?? 'pending');
		}
		return result;
	}
}
