import { TicketService } from '../../domain/ports/ticket-service.port';
import { IdempotencyKey } from '../../domain/value-objects/idempotency-key.vo';
import { TicketMetadata } from '../../domain/value-objects/ticket-metadata.vo';
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
	readonly metadata?: TicketMetadata;
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
		metadata?: TicketMetadata;
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
			metadata: input.metadata,
			resolved: false,
		});
		return ref;
	}

	async resolve(input: { ticket: TicketRef }): Promise<void> {
		const ticket = this.tickets.find((t) => t.ref.equals(input.ticket));
		if (ticket) ticket.resolved = true;
	}

	async resolveScoped(input: {
		distributionId: string;
		ticketId: string;
	}): Promise<boolean> {
		const ticket = this.tickets.find(
			(t) =>
				t.ref.value === input.ticketId &&
				t.distributionId === input.distributionId,
		);
		if (!ticket) return false;
		ticket.resolved = true;
		return true;
	}
}
