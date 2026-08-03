import { Inject, Injectable } from '@nestjs/common';

import { ChannelInputType } from '../../domain/channel-delivery/channel-interpreter.types';
import { IngestResultReader } from '../../domain/ports/ingest-result-reader.port';
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
 * CiImportCheckRunner — consumer của `dist.ci-import-check` (WAIT INGEST).
 *
 * Poll CI xem đã process batch imported chưa:
 *  · 'pending' → runner return null (BullMQ delayed re-poll)
 *  · 'ok'      → ARRIVED (wake up WAIT INGEST → next stage)
 *  · 'problem' → open ticket INGEST_FAIL → WAIT_FAIL + ticketRef (ISSUES)
 *
 * Khối C: problem = lỗi nghiệp vụ → ticket + WAIT_FAIL, KHÔNG throw.
 */
export const INGEST_RESULT_READER = Symbol('IngestResultReader');

@Injectable()
export class CiImportCheckRunner {
	constructor(
		@Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
		@Inject(DISTRIBUTION_REPOSITORY)
		private readonly repo: DistributionRepository,
		@Inject(INGEST_RESULT_READER)
		private readonly reader: IngestResultReader,
		@Inject(TICKET_SERVICE) private readonly ticketService: TicketService,
	) {}

	async run(
		payload: ChannelJobPayload,
	): Promise<ApplyChannelInputCommand | null> {
		const dist = await this.uow.run((ctx) =>
			this.repo.load(ctx, payload.distributionId),
		);
		if (!dist) throw new AggregateNotFoundError(payload.distributionId);

		// CI import batch is keyed by the upload's external_identifier (timestamp folder).
		// Within a batch there may be many packages; reader filters to THIS release's UPC.
		const upc = dist.upc;
		if (!upc) {
			throw new Error(
				`CiImportCheckRunner: UPC not set on distribution ${dist.id} — cannot check import batch`,
			);
		}

		// batchExternalId = timestamp folder from SFTP upload path (e.g. "20260803104705024")
		// packageUris["CI"] = "local/20260803104705024/701798205553" → split('/')[1]
		const ciPackageUri = dist.packageUriFor('CI');
		if (!ciPackageUri) {
			throw new Error(
				`CiImportCheckRunner: no CI package URI on distribution ${dist.id}`,
			);
		}
		const batchId = ciPackageUri.split('/')[1];
		if (!batchId) {
			throw new Error(
				`CiImportCheckRunner: cannot extract batchId from packageUri "${ciPackageUri}"`,
			);
		}
		const status = await this.reader.read({
			batchId,
			upc,
			key: IdempotencyKey.create(payload.key),
		});

		if (status.kind === 'pending') return null; // re-poll (delayMs)

		if (status.kind === 'problem') {
			// Khối C: ingest problem = lỗi nghiệp vụ → mở ticket → WAIT_FAIL + ticketRef.
			// Interpreter chuyển ISSUES. KHÔNG throw.
			const ticketRef = await this.ticketService.open({
				distributionId: dist.id,
				channelId: payload.channelId,
				reason: TicketReason.INGEST_FAIL,
				detail: `CI ingest batch problem: ${batchId}`,
				// Stable key (channel, reason, retry generation) — NOT payload.key which drifts.
				key: ticketIdempotencyKey(
					payload.channelId,
					TicketReason.INGEST_FAIL,
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
