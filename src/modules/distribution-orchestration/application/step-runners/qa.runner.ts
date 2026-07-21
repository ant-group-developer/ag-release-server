import { Inject, Injectable } from '@nestjs/common';

import { ChannelInputType } from '../../domain/channel-delivery/channel-interpreter.types';
import { QaChecker } from '../../domain/ports/qa-checker.port';
import { TicketService } from '../../domain/ports/ticket-service.port';
import { IdempotencyKey } from '../../domain/value-objects/idempotency-key.vo';
import { TicketReason } from '../../domain/value-objects/ticket-ref.vo';
import { ApplyChannelInputCommand } from '../commands/distribution.command';
import { AggregateNotFoundError } from '../errors/aggregate-not-found.error';
import {
	DISTRIBUTION_REPOSITORY,
	DistributionRepository,
} from '../ports/distribution-repository.port';
import { UNIT_OF_WORK, UnitOfWork } from '../ports/unit-of-work.port';
import { TICKET_SERVICE } from '../../infrastructure/adapters/postgres-ticket.adapter';
import { ChannelJobPayload } from './runner-payload';
import { ticketIdempotencyKey } from './ticket-idempotency-key';

/**
 * QaRunner — consumer của `dist.ci-qa-check` (GATE qa).
 *
 * clean → GATE_PASS · flagged → open ticket QA_FLAG → GATE_FAIL + ticketRef
 * (interpreter chuyển ISSUES).
 *
 * Khối C: flagged = lỗi nghiệp vụ (không phải transient) → ticket + GATE_FAIL, KHÔNG throw.
 */
export const QA_CHECKER = Symbol('QaChecker');

@Injectable()
export class QaRunner {
	constructor(
		@Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
		@Inject(DISTRIBUTION_REPOSITORY)
		private readonly repo: DistributionRepository,
		@Inject(QA_CHECKER) private readonly checker: QaChecker,
		@Inject(TICKET_SERVICE) private readonly ticketService: TicketService,
	) {}

	async run(payload: ChannelJobPayload): Promise<ApplyChannelInputCommand> {
		const dist = await this.uow.run((ctx) =>
			this.repo.load(ctx, payload.distributionId),
		);
		if (!dist) throw new AggregateNotFoundError(payload.distributionId);

		// dist.upc is set after identifier provisioning (B8.1 requires UPC/GTIN).
		const upc = dist.upc;
		if (!upc) {
			throw new Error(
				`QaRunner: UPC not set on distribution ${dist.id} — cannot check QA flags`,
			);
		}

		const result = await this.checker.check({
			upc,
			key: IdempotencyKey.create(payload.key),
		});

		if (result.kind === 'flagged') {
			// Khối C: QA flagged = lỗi nghiệp vụ → mở ticket → GATE_FAIL + ticketRef.
			// Interpreter chuyển ISSUES. KHÔNG throw.
			const ticketRef = await this.ticketService.open({
				distributionId: dist.id,
				channelId: payload.channelId,
				reason: TicketReason.QA_FLAG,
				detail: `QA flags: ${result.flags.join(', ')}`,
				// Stable key (channel, reason, retry generation) — NOT payload.key which drifts.
				key: ticketIdempotencyKey(
					payload.channelId,
					TicketReason.QA_FLAG,
					dist.retryCount,
				),
			});

			return {
				type: 'APPLY_CHANNEL_INPUT',
				distributionId: dist.id,
				key: `${payload.key}:fail`,
				channelId: payload.channelId,
				input: {
					type: ChannelInputType.GATE_FAIL,
					ticketRef: ticketRef.value,
				},
			};
		}

		return {
			type: 'APPLY_CHANNEL_INPUT',
			distributionId: dist.id,
			key: `${payload.key}:done`,
			channelId: payload.channelId,
			input: { type: ChannelInputType.GATE_PASS },
		};
	}
}
