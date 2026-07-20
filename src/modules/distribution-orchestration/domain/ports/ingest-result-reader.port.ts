import { IdempotencyKey } from '../value-objects/idempotency-key.vo';

/** Result of reading how the aggregator processed an already-imported batch. */
export type IngestStatus =
	| { readonly kind: 'ok' }
	| { readonly kind: 'pending' }
	| { readonly kind: 'problem'; readonly errors: string[] };

/**
 * IngestResultReader — READS how the aggregator processed the batch we already imported
 * (it does NOT trigger an import; the import happened at upload). Adapter polls CI REST.
 *
 * A batch (`batchId`) may contain MANY packages (one per UPC). `upc` selects which
 * package's ingest status to read — one package's problem must NOT fail a sibling package.
 */
export interface IngestResultReader {
	read(input: {
		batchId: string;
		upc: string;
		key: IdempotencyKey;
	}): Promise<IngestStatus>;
}
