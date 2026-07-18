import { Inject, Injectable } from '@nestjs/common';

import { ChannelInputType } from '../../domain/channel-delivery/channel-interpreter.types';
import { Exporter } from '../../domain/ports/exporter.port';
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
 * ExportBatchRunner — consumer của `dist.export-batch` (WAIT EXPORT).
 *
 * Gom batch export theo `exportMethod` (CI_DEAL admin panel / STATE51 email).
 * Runner này KHÔNG chờ status kế — sau khi export enqueue, phát ARRIVED để
 * WAIT EXPORT sang stage kế (GO_LIVE). Adapter thật (Phase 4) chờ email/webhook.
 *
 * Cần `exportMethod` + `upc` — lấy từ dist + channel.spec.
 */
export const EXPORTER = Symbol('Exporter');

@Injectable()
export class ExportBatchRunner {
	constructor(
		@Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
		@Inject(DISTRIBUTION_REPOSITORY)
		private readonly repo: DistributionRepository,
		@Inject(EXPORTER) private readonly exporter: Exporter,
	) {}

	async run(payload: ChannelJobPayload): Promise<ApplyChannelInputCommand> {
		const dist = await this.uow.run((ctx) =>
			this.repo.load(ctx, payload.distributionId),
		);
		if (!dist) throw new AggregateNotFoundError(payload.distributionId);
		const channel = dist.channels.find(
			(c) => c.channelId === payload.channelId,
		);
		if (!channel) {
			throw new Error(
				`ExportBatchRunner: channel ${payload.channelId} not found`,
			);
		}
		if (!channel.spec.exportMethod) {
			throw new Error(
				`ExportBatchRunner: channel ${payload.channelId} missing exportMethod`,
			);
		}
		if (!dist.upc) {
			throw new Error(
				`ExportBatchRunner: distribution ${dist.id} missing UPC`,
			);
		}

		await this.exporter.export({
			method: channel.spec.exportMethod,
			upcs: [dist.upc],
			key: IdempotencyKey.create(payload.key),
		});

		return {
			type: 'APPLY_CHANNEL_INPUT',
			distributionId: dist.id,
			key: `${payload.key}:done`,
			channelId: payload.channelId,
			input: { type: ChannelInputType.ARRIVED },
		};
	}
}
