import { ExportMethod } from '../channel-delivery/channel-delivery-spec';
import { IdempotencyKey } from '../value-objects/idempotency-key.vo';

export interface ExportJobRef {
	readonly jobId: string;
}

/**
 * Exporter — one method, picks the mechanism by `ExportMethod` (CI_DEAL admin panel vs STATE51 email).
 * NOT split per provider — the channel's exportMethod chooses the path inside the adapter.
 */
export interface Exporter {
	export(input: {
		method: ExportMethod;
		upcs: string[];
		recipients?: string[];
		key: IdempotencyKey;
	}): Promise<ExportJobRef>;
}
