import {
	IngestResultReader,
	IngestStatus,
} from '../../domain/ports/ingest-result-reader.port';
import { IdempotencyKey } from '../../domain/value-objects/idempotency-key.vo';

/**
 * InMemoryIngestResultReader — test double cho IngestResultReader.
 * Mặc định 'ok'. `queueStatuses()` nạp 1 dãy trạng thái để mô phỏng polling
 * (vd pending → pending → ok), giữ nguyên trạng thái cuối khi hết dãy.
 */
export class InMemoryIngestResultReader implements IngestResultReader {
	private readonly queueByBatch = new Map<string, IngestStatus[]>();
	private readonly defaultStatus: IngestStatus = { kind: 'ok' };

	queueStatuses(batchId: string, statuses: IngestStatus[]): void {
		this.queueByBatch.set(batchId, [...statuses]);
	}

	async read(input: {
		batchId: string;
		key: IdempotencyKey;
	}): Promise<IngestStatus> {
		const queue = this.queueByBatch.get(input.batchId);
		if (!queue || queue.length === 0) return this.defaultStatus;

		return queue.length > 1 ? queue.shift()! : queue[0];
	}
}
