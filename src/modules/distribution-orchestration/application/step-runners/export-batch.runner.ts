import { Inject, Injectable } from '@nestjs/common';

import { ExportMethod } from '../../domain/channel-delivery/channel-delivery-spec';
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
		if (!dist.upc) {
			throw new Error(
				`ExportBatchRunner: distribution ${dist.id} missing UPC`,
			);
		}

		// Cluster CI: 1 channel gom N DSP có thể trộn method (deal + state51). Export chạy 1 lần cho
		// mỗi DISTINCT method (deal→no-op, state51→email 1 lần list UPC) — vẫn 1 upload trước đó.
		// Channel thường: dùng spec.exportMethod của chính nó.
		const methods = channel.isCluster
			? [
					...new Set(
						channel.members
							.map((m) => m.exportMethod)
							.filter((m): m is ExportMethod => !!m),
					),
				]
			: channel.spec.exportMethod
				? [channel.spec.exportMethod]
				: [];

		if (methods.length === 0) {
			throw new Error(
				`ExportBatchRunner: channel ${payload.channelId} missing exportMethod`,
			);
		}

		for (const method of methods) {
			await this.exporter.export({
				method,
				upcs: [dist.upc],
				// key riêng/method để idempotent khi cụm có nhiều method.
				key: IdempotencyKey.create(`${payload.key}:${method}`),
			});
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
