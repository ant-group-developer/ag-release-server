import { IdempotencyKey } from '../value-objects/idempotency-key.vo';

/** Result of reading how the aggregator processed an already-imported batch. */
export type IngestStatus =
	| { readonly kind: 'ok' }
	| { readonly kind: 'pending' }
	| { readonly kind: 'problem'; readonly errors: string[] };

/**
 * IngestResultReader — READS how the aggregator processed the batch we already imported
 * (it does NOT trigger an import; the import happened at upload). Adapter polls CI REST.
 */
export interface IngestResultReader {
	read(input: { batchId: string; key: IdempotencyKey }): Promise<IngestStatus>;
}
