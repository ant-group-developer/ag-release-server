import { IdempotencyKey } from '../value-objects/idempotency-key.vo';

export type QaResult =
	| { readonly kind: 'clean' }
	| { readonly kind: 'flagged'; readonly flags: string[] };

/**
 * QaChecker — checks QA flags for a release. A GATE stage uses this: clean → pass, flagged → ISSUES.
 *
 * `upc` = the release's UPC/GTIN barcode (e.g., "701798205454").
 * CI API requires UPC (?gtin=) to look up QA flags — NOT our internal releaseId.
 */
export interface QaChecker {
	check(input: { upc: string; key: IdempotencyKey }): Promise<QaResult>;
}
