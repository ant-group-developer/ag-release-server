import { InvariantViolationError } from '../errors/domain-errors';

/**
 * TicketReason — classifies why a ticket was opened (for UI filtering / reporting).
 * This ticket is OWNED by orchestration, NOT reusing v3 `issue`/`release-errors`.
 * Each value maps to a specific failure point in the flow.
 */
export enum TicketReason {
	VALIDATION = 'VALIDATION', // schema/asset validation error (before channels)
	REVIEW_REJECT = 'REVIEW_REJECT', // reviewer rejected
	UPLOAD_FAIL = 'UPLOAD_FAIL', // SFTP upload failed after maxAttempts
	INGEST_FAIL = 'INGEST_FAIL', // aggregator batch processing failed
	QA_FLAG = 'QA_FLAG', // QA still has open flags (GATE fail)
	EXPORT_FAIL = 'EXPORT_FAIL', // export CI / email State51 failed
	PARTNER_FAIL = 'PARTNER_FAIL', // direct DSP reported failure
	TAKEDOWN_FAIL = 'TAKEDOWN_FAIL', // takedown failed
}

/**
 * TicketRef — a reference to an orchestration ticket opened via the `TicketService` port.
 * Attached to every path into ISSUES / ACTION_REQUIRED (INV-C6: no silent failures).
 */
export class TicketRef {
	private constructor(public readonly value: string) {}

	static create(raw: string): TicketRef {
		const v = raw.trim();
		if (!v) {
			throw new InvariantViolationError('TicketRef', 'empty');
		}
		return new TicketRef(v);
	}

	equals(o: TicketRef): boolean {
		return this.value === o.value;
	}
}
