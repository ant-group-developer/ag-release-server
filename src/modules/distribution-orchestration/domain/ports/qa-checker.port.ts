import { IdempotencyKey } from '../value-objects/idempotency-key.vo';

export type QaResult =
	| { readonly kind: 'clean' }
	| { readonly kind: 'flagged'; readonly flags: string[] };

/**
 * QaChecker — checks QA flags for a release. A GATE stage uses this: clean → pass, flagged → ISSUES.
 */
export interface QaChecker {
	check(input: { releaseId: string; key: IdempotencyKey }): Promise<QaResult>;
}
