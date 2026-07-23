import { Inject, Injectable } from '@nestjs/common';

import { IdentifierProvisioner } from '../../domain/ports/identifier-provisioner.port';
import { IdempotencyKey } from '../../domain/value-objects/idempotency-key.vo';
import { MarkIdsProvisionedCommand } from '../commands/distribution.command';
import { AggregateNotFoundError } from '../errors/aggregate-not-found.error';
import {
	DISTRIBUTION_REPOSITORY,
	DistributionRepository,
} from '../ports/distribution-repository.port';
import { UNIT_OF_WORK, UnitOfWork } from '../ports/unit-of-work.port';
import { JobPayload } from '../ports/workflow-engine.port';

/**
 * ProvisionIdRunner — consumer của `dist.provision-id`.
 *
 * 1. Load Distribution → lấy `releaseId`
 * 2. Nếu `dist.upc` đã có → skip gRPC (idempotency guard, xem trong run()).
 * 3. Gọi IdentifierProvisioner.provisionUpc()
 * 4. Trả `MARK_IDS_PROVISIONED {upc}` — loop driver (Step 8 BullMQ worker /
 *    Step 5b test) đưa command này về OrchestrateHandler.
 *
 * Runner KHÔNG gọi OrchestrateHandler trực tiếp — decouple để Step 8 BullMQ
 * worker enqueue command vào `dist.orchestrate` mà không đổi runner.
 */
export const IDENTIFIER_PROVISIONER = Symbol('IdentifierProvisioner');

@Injectable()
export class ProvisionIdRunner {
	constructor(
		@Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
		@Inject(DISTRIBUTION_REPOSITORY)
		private readonly repo: DistributionRepository,
		@Inject(IDENTIFIER_PROVISIONER)
		private readonly provisioner: IdentifierProvisioner,
	) {}

	async run(payload: JobPayload): Promise<MarkIdsProvisionedCommand> {
		const dist = await this.uow.run((ctx) =>
			this.repo.load(ctx, payload.distributionId),
		);
		if (!dist) throw new AggregateNotFoundError(payload.distributionId);

		// Idempotency guard: nếu UPC đã cấp (job redeliver sau crash / retry BullMQ trước khi
		// MARK_IDS_PROVISIONED commit) → KHÔNG gọi gRPC lần nữa (getUpc cấp GTIN mới mỗi lần,
		// không get-or-create theo releaseId). Trả lại UPC đã có → command idempotent.
		if (dist.upc) {
			return {
				type: 'MARK_IDS_PROVISIONED',
				distributionId: dist.id,
				key: `${payload.key}:done`,
				upc: dist.upc,
			};
		}

		const upc = await this.provisioner.provisionUpc({
			releaseId: dist.releaseId,
			key: IdempotencyKey.create(payload.key),
		});

		return {
			type: 'MARK_IDS_PROVISIONED',
			distributionId: dist.id,
			key: `${payload.key}:done`,
			upc: upc.value,
		};
	}
}
