import { IdempotencyKey } from '../value-objects/idempotency-key.vo';
import { TicketMetadata } from '../value-objects/ticket-metadata.vo';
import { TicketReason, TicketRef } from '../value-objects/ticket-ref.vo';

/**
 * TicketService — orchestration's OWN ticket store (NOT reusing v3 issue/release-errors).
 * The application opens a ticket here, then passes the returned TicketRef into the transition
 * that enters ISSUES/ACTION_REQUIRED (INV-C6). Adapter/persistence decided in phase 2.
 */
export interface TicketService {
	open(input: {
		distributionId: string;
		channelId?: string;
		reason: TicketReason;
		detail: string;
		metadata?: TicketMetadata;
		key: IdempotencyKey;
	}): Promise<TicketRef>;
	resolve(input: { ticket: TicketRef }): Promise<void>;
	/**
	 * Resolve có kiểm tra ticket thuộc đúng distribution (chống resolve nhầm ticket
	 * distribution khác). Trả false nếu ticket không tồn tại / không thuộc distribution.
	 */
	resolveScoped(input: {
		distributionId: string;
		ticketId: string;
	}): Promise<boolean>;
}
