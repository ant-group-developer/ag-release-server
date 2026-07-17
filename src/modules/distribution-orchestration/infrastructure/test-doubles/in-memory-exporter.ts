import { ExportMethod } from '../../domain/channel-delivery/channel-delivery-spec';
import { Exporter, ExportJobRef } from '../../domain/ports/exporter.port';
import { IdempotencyKey } from '../../domain/value-objects/idempotency-key.vo';

export interface RecordedExport {
	readonly method: ExportMethod;
	readonly upcs: string[];
	readonly recipients?: string[];
	readonly jobId: string;
}

/**
 * InMemoryExporter — test double cho Exporter. Idempotent theo key: export lại
 * cùng key trả về job đã tạo, không tạo job mới (chống export trùng khi retry).
 */
export class InMemoryExporter implements Exporter {
	readonly exported: RecordedExport[] = [];
	private readonly jobByKey = new Map<string, ExportJobRef>();
	private seq = 0;

	async export(input: {
		method: ExportMethod;
		upcs: string[];
		recipients?: string[];
		key: IdempotencyKey;
	}): Promise<ExportJobRef> {
		const existing = this.jobByKey.get(input.key.value);
		if (existing) return existing;

		const job: ExportJobRef = { jobId: `export-${++this.seq}` };
		this.jobByKey.set(input.key.value, job);
		this.exported.push({
			method: input.method,
			upcs: input.upcs,
			recipients: input.recipients,
			jobId: job.jobId,
		});
		return job;
	}
}
