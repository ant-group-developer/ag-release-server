import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';

import { TicketService } from '../../domain/ports/ticket-service.port';
import { IdempotencyKey } from '../../domain/value-objects/idempotency-key.vo';
import { TicketMetadata } from '../../domain/value-objects/ticket-metadata.vo';
import {
	TicketReason,
	TicketRef,
} from '../../domain/value-objects/ticket-ref.vo';
import { OrchestrationTicketOrmEntity } from '../persistence/orchestration-ticket.orm-entity';

export const TICKET_SERVICE = Symbol('TicketService');

/**
 * PostgresTicketAdapter — adapter thật cho TicketService port.
 *
 * Lưu ticket vào bảng `orchestration_ticket` (own store, NOT v3 issue/release_errors).
 * Metadata column (jsonb) chứa structured `{items[], context?}` cho client render.
 *
 * **Idempotency (2 lớp):**
 * 1. Query `idempotency_key` trước INSERT → có thì return existing
 * 2. UNIQUE constraint catch concurrent race → re-query → return existing
 */
@Injectable()
export class PostgresTicketAdapter implements TicketService {
	private readonly logger = new Logger(PostgresTicketAdapter.name);

	constructor(
		@InjectRepository(OrchestrationTicketOrmEntity)
		private readonly ticketRepo: Repository<OrchestrationTicketOrmEntity>,
	) {}

	async open(input: {
		distributionId: string;
		channelId?: string;
		reason: TicketReason;
		detail: string;
		metadata?: TicketMetadata;
		key: IdempotencyKey;
	}): Promise<TicketRef> {
		// Layer 1: check by idempotency key
		const existing = await this.ticketRepo.findOneBy({
			idempotencyKey: input.key.value,
		});
		if (existing) {
			this.logger.log(
				`[open] idempotent hit key=${input.key.value} → ticket=${existing.id}`,
			);
			return TicketRef.create(existing.id);
		}

		// INSERT new ticket
		const entity = this.ticketRepo.create({
			distributionId: input.distributionId,
			channelId: input.channelId ?? null,
			reason: input.reason,
			detail: input.detail,
			metadata: input.metadata ? input.metadata : null,
			status: 'open',
			idempotencyKey: input.key.value,
		});

		try {
			const saved = await this.ticketRepo.save(entity);
			this.logger.log(
				`[open] created ticket=${saved.id} reason=${input.reason} dist=${input.distributionId}`,
			);
			return TicketRef.create(saved.id);
		} catch (err) {
			// Layer 2: concurrent race — UNIQUE violation on idempotency_key
			if (isUniqueViolation(err)) {
				this.logger.warn(
					`[open] concurrent duplicate key=${input.key.value} — re-querying`,
				);
				const raced = await this.ticketRepo.findOneBy({
					idempotencyKey: input.key.value,
				});
				if (raced) return TicketRef.create(raced.id);
			}
			throw err;
		}
	}

	async resolve(input: { ticket: TicketRef }): Promise<void> {
		const result = await this.ticketRepo.update(
			{ id: input.ticket.value },
			{ status: 'resolved', resolvedAt: new Date() },
		);
		if (result.affected === 0) {
			this.logger.warn(
				`[resolve] ticket=${input.ticket.value} not found — no-op`,
			);
		}
	}
}

/** Detect Postgres unique_violation (23505). */
function isUniqueViolation(err: unknown): boolean {
	if (err instanceof QueryFailedError) {
		const driverError = (
			err as QueryFailedError & { driverError?: { code?: string } }
		).driverError;
		return driverError?.code === '23505';
	}
	return false;
}
