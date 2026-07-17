import { Inject, Injectable } from '@nestjs/common';

import { ChannelInputType } from '../../domain/channel-delivery/channel-interpreter.types';
import { IngestResultReader } from '../../domain/ports/ingest-result-reader.port';
import { IdempotencyKey } from '../../domain/value-objects/idempotency-key.vo';
import { ApplyChannelInputCommand } from '../commands/distribution.command';
import { AggregateNotFoundError } from '../errors/aggregate-not-found.error';
import {
	DISTRIBUTION_REPOSITORY,
	DistributionRepository,
} from '../ports/distribution-repository.port';
import { UNIT_OF_WORK, UnitOfWork } from '../ports/unit-of-work.port';
import { ChannelJobPayload } from './runner-payload';

/**
 * CiImportCheckRunner — consumer của `dist.ci-import-check` (WAIT INGEST).
 *
 * Poll CI xem đã process batch imported chưa:
 *  · 'pending' → runner return null (BullMQ delayed re-poll — Step 6 wire delayMs)
 *  · 'ok'      → ARRIVED (wake up WAIT INGEST → next stage)
 *  · 'problem' → WAIT_FAIL (channel → ISSUES, cần ticketRef)
 *
 * batchId ở Step 5b: derived từ `${distId}:${channelId}` — batchId thật lấy từ
 * uploader.upload result ở Step 6 (chưa cần ở integration test).
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
	) {}

	async run(
		payload: ChannelJobPayload,
	): Promise<ApplyChannelInputCommand | null> {
		const dist = await this.uow.run((ctx) =>
			this.repo.load(ctx, payload.distributionId),
		);
		if (!dist) throw new AggregateNotFoundError(payload.distributionId);

		const batchId = `${dist.id}:${payload.channelId}`;
		const status = await this.reader.read({
			batchId,
			key: IdempotencyKey.create(payload.key),
		});

		if (status.kind === 'pending') return null; // re-poll (Step 6 delayMs)
		if (status.kind === 'problem') {
			// WAIT_FAIL cần ticketRef — Step 6 mở ticket qua TicketService rồi phát command.
			// Step 5b: throw để runner đơn giản; test integration không đi qua path này.
			throw new Error(
				`CiImportCheckRunner: ingest problem for ${payload.channelId}`,
			);
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
