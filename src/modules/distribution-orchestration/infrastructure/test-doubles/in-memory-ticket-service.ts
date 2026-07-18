import { TicketService } from '../../domain/ports/ticket-service.port';
import { IdempotencyKey } from '../../domain/value-objects/idempotency-key.vo';
import {
	TicketReason,
	TicketRef,
} from '../../domain/value-objects/ticket-ref.vo';

export interface RecordedTicket {
	readonly ref: TicketRef;
	readonly distributionId: string;
	readonly channelId?: string;
	readonly reason: TicketReason;
	readonly detail: string;
	resolved: boolean;
}

/**
 * InMemoryTicketService — test double cho TicketService.
 * Idempotent theo key: mở lại cùng key trả về ticket đã mở, không tạo ticket trùng.
 */
export class InMemoryTicketService implements TicketService {
	readonly tickets: RecordedTicket[] = [];
	private readonly refByKey = new Map<string, TicketRef>();
	private seq = 0;

	async open(input: {
		distributionId: string;
		channelId?: string;
		reason: TicketReason;
		detail: string;
		key: IdempotencyKey;
	}): Promise<TicketRef> {
		const existing = this.refByKey.get(input.key.value);
		if (existing) return existing;

		const ref = TicketRef.create(`TICKET-${++this.seq}`);
		this.refByKey.set(input.key.value, ref);
		this.tickets.push({
			ref,
			distributionId: input.distributionId,
			channelId: input.channelId,
			reason: input.reason,
			detail: input.detail,
			resolved: false,
		});
		return ref;
	}

	async resolve(input: { ticket: TicketRef }): Promise<void> {
		const ticket = this.tickets.find((t) => t.ref.equals(input.ticket));
		if (ticket) ticket.resolved = true;
	}
}
