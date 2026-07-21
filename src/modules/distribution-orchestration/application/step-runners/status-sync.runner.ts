import { Inject, Injectable } from '@nestjs/common';

import { ChannelInputType } from '../../domain/channel-delivery/channel-interpreter.types';
import { DeliveryStatusReader } from '../../domain/ports/delivery-status-reader.port';
import { TicketService } from '../../domain/ports/ticket-service.port';
import { DspCode } from '../../domain/value-objects/dsp-code.vo';
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
 * StatusSyncRunner — consumer của `dist.status-sync` (WAIT PARTNER / GO_LIVE / TAKEDOWN).
 *
 * Poll DSP live status:
 *  · 'pending'  → null (re-poll với delayMs)
 *  · 'live'     → ARRIVED (WAIT sang stage kế; nếu là stage cuối → aggregate bubble-up)
 *  · 'rejected' → open ticket PARTNER_FAIL → WAIT_FAIL + ticketRef (ISSUES)
 *
 * Khối C: rejected = lỗi nghiệp vụ → ticket + WAIT_FAIL, KHÔNG throw.
 */
export const DELIVERY_STATUS_READER = Symbol('DeliveryStatusReader');

@Injectable()
export class StatusSyncRunner {
	constructor(
		@Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
		@Inject(DISTRIBUTION_REPOSITORY)
		private readonly repo: DistributionRepository,
		@Inject(DELIVERY_STATUS_READER)
		private readonly reader: DeliveryStatusReader,
		@Inject(TICKET_SERVICE) private readonly ticketService: TicketService,
	) {}

	async run(
		payload: ChannelJobPayload,
	): Promise<ApplyChannelInputCommand | null> {
		const dist = await this.uow.run((ctx) =>
			this.repo.load(ctx, payload.distributionId),
		);
		if (!dist) throw new AggregateNotFoundError(payload.distributionId);
		const channel = dist.channels.find(
			(c) => c.channelId === payload.channelId,
		);
		if (!channel) {
			throw new Error(
				`StatusSyncRunner: channel ${payload.channelId} not found`,
			);
		}

		const dspCode = DspCode.create(channel.spec.dspCode);

		// CI API B10 requires UPC (?gtin={{upc}}) to check delivery status.
		// dist.upc is available after identifier provisioning step.
		const upc = dist.upc;
		if (!upc) {
			throw new Error(
				`StatusSyncRunner: UPC not set on distribution ${dist.id} — cannot check delivery status`,
			);
		}

		const statuses = await this.reader.read({
			upc,
			dspCodes: [dspCode],
		});
		const status = statuses.get(dspCode.value) ?? 'pending';

		if (status === 'pending') return null;

		if (status === 'rejected') {
			// Khối C: DSP rejected = lỗi nghiệp vụ → mở ticket → WAIT_FAIL + ticketRef.
			// Interpreter chuyển ISSUES. KHÔNG throw.
			const ticketRef = await this.ticketService.open({
				distributionId: dist.id,
				channelId: payload.channelId,
				reason: TicketReason.PARTNER_FAIL,
				detail: `DSP ${channel.spec.dspCode} rejected release`,
				// Stable key (channel, reason, retry generation) — NOT payload.key which drifts.
				key: ticketIdempotencyKey(
					payload.channelId,
					TicketReason.PARTNER_FAIL,
					dist.retryCount,
				),
			});

			return {
				type: 'APPLY_CHANNEL_INPUT',
				distributionId: dist.id,
				key: `${payload.key}:fail`,
				channelId: payload.channelId,
				input: {
					type: ChannelInputType.WAIT_FAIL,
					ticketRef: ticketRef.value,
				},
			};
		}

		return {
			type: 'APPLY_CHANNEL_INPUT',
			distributionId: dist.id,
			key: `${payload.key}:done`,
			channelId: payload.channelId,
			input: { type: ChannelInputType.ARRIVED },
		};
	}
}
