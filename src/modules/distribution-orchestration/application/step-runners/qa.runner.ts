import { Inject, Injectable } from '@nestjs/common';

import { ChannelInputType } from '../../domain/channel-delivery/channel-interpreter.types';
import { QaChecker } from '../../domain/ports/qa-checker.port';
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
 * QaRunner — consumer của `dist.ci-qa-check` (GATE qa).
 *
 * clean → GATE_PASS · flagged → GATE_FAIL (cần ticketRef → mở TicketService).
 * Step 5b: flagged → throw để test không cần TicketService plumbing.
 */
export const QA_CHECKER = Symbol('QaChecker');

@Injectable()
export class QaRunner {
	constructor(
		@Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
		@Inject(DISTRIBUTION_REPOSITORY)
		private readonly repo: DistributionRepository,
		@Inject(QA_CHECKER) private readonly checker: QaChecker,
	) {}

	async run(payload: ChannelJobPayload): Promise<ApplyChannelInputCommand> {
		const dist = await this.uow.run((ctx) =>
			this.repo.load(ctx, payload.distributionId),
		);
		if (!dist) throw new AggregateNotFoundError(payload.distributionId);

		const result = await this.checker.check({
			releaseId: dist.releaseId,
			key: IdempotencyKey.create(payload.key),
		});
		if (result.kind === 'flagged') {
			throw new Error(
				`QaRunner: QA flagged for ${payload.channelId}: ${result.flags.join(',')}`,
			);
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
