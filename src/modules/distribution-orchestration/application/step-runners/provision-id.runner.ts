import { Inject, Injectable } from '@nestjs/common';

import { IdentifierProvisioner } from '../../domain/ports/identifier-provisioner.port';
import { IdempotencyKey } from '../../domain/value-objects/idempotency-key.vo';
import { MarkIdsProvisionedCommand } from '../commands/distribution.command';
import { AggregateNotFoundError } from '../errors/aggregate-not-found.error';
import {
	DISTRIBUTION_REPOSITORY,
	DistributionRepository,
} from '../ports/distribution-repository.port';
import {
	RELEASE_SNAPSHOT_READER,
	ReleaseSnapshotReader,
} from '../ports/release-snapshot-reader.port';
import { UNIT_OF_WORK, UnitOfWork } from '../ports/unit-of-work.port';
import { JobPayload } from '../ports/workflow-engine.port';

/**
 * ProvisionIdRunner — consumer của `dist.provision-id`.
 *
 * 1. Load Distribution → lấy `releaseId`
 * 2. Load Snapshot → nếu snapshot có `upc`, dùng upc có sẵn (skip gRPC).
 * 3. Nếu `dist.upc` đã có → skip gRPC (idempotency guard).
 * 4. Gọi IdentifierProvisioner.provisionUpc()
 * 5. Trả `MARK_IDS_PROVISIONED {upc}` — loop driver (Step 8 BullMQ worker /
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
		@Inject(RELEASE_SNAPSHOT_READER)
		private readonly snapshotReader: ReleaseSnapshotReader,
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

		// Skip logic: Nếu user đã cung cấp UPC trong metadata (lưu trong snapshot)
		const snapshot = await this.snapshotReader.loadById(dist.snapshotId);
		if (!snapshot) {
			throw new Error(`Snapshot ${dist.snapshotId} not found`);
		}

		const snapshotPayload = snapshot.payload as any;

		const missingIsrcTracks = (snapshotPayload.tracks || []).filter(
			(t: any) => !t.isrc,
		);

		if (missingIsrcTracks.length > 0) {
			const trackIds = missingIsrcTracks
				.map((t: any) => t.id)
				.filter(Boolean) as string[];

			if (trackIds.length > 0) {
				const provisionedIsrcs = await this.provisioner.provisionIsrcs({
					trackIds,
					releaseId: dist.releaseId,
					key: IdempotencyKey.create(payload.key + ':isrc'),
				});

				// Cập nhật lại snapshot.payload với ISRC mới
				snapshotPayload.tracks.forEach((t: any) => {
					if (t.id && provisionedIsrcs.has(t.id)) {
						t.isrc = provisionedIsrcs.get(t.id)!.value;
					}
				});

				// Lưu lại snapshot (dùng Entity Manager hoặc raw update)
				// Để không phải inject Repository vào runner, ta dùng uow.run()
				await this.uow.run(async (ctx) => {
					await ctx.manager.update(
						'release_snapshot',
						{ id: dist.snapshotId },
						{ payload: snapshotPayload },
					);
				});
			}
		}

		if (snapshotPayload.upc) {
			return {
				type: 'MARK_IDS_PROVISIONED',
				distributionId: dist.id,
				key: `${payload.key}:done`,
				upc: snapshotPayload.upc,
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
