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
 * 1. Load Distribution + Snapshot
 * 2. ISRC (luôn chạy): kiểm tra tracks thiếu ISRC → gọi gRPC provisionIsrcs → cập nhật snapshot.
 *    Chạy TRƯỚC UPC guard vì snapshot update dùng tx riêng — có thể fail độc lập.
 * 3. UPC idempotency guard: nếu `dist.upc` đã có → skip gRPC (dùng UPC cũ).
 * 4. UPC resolve: dùng snapshot.upc nếu user đã nhập, hoặc gọi gRPC provisionUpc.
 * 5. Trả `MARK_IDS_PROVISIONED {upc}` — loop driver đưa command về OrchestrateHandler.
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
		console.log(
			`🆔 [ProvisionIdRunner] start: distId=${payload.distributionId} key=${payload.key}`,
		);
		const dist = await this.uow.run((ctx) =>
			this.repo.load(ctx, payload.distributionId),
		);
		if (!dist) throw new AggregateNotFoundError(payload.distributionId);

		// ── 1. ISRC provisioning (luôn chạy, bất kể UPC đã có hay chưa) ──
		// Snapshot update chạy tx riêng nên có thể fail độc lập với MARK_IDS_PROVISIONED.
		// Nếu chỉ guard bằng dist.upc thì retry sẽ skip ISRC vĩnh viễn → build-package lỗi.
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

			if (trackIds.length === 0) {
				throw new Error(
					`${missingIsrcTracks.length} track(s) missing ISRC but have no 'id' field — cannot provision. ` +
						`distributionId=${dist.id}, snapshotId=${dist.snapshotId}`,
				);
			}

			const provisionedIsrcs = await this.provisioner.provisionIsrcs({
				trackIds,
				releaseId: dist.releaseId,
				key: IdempotencyKey.create(payload.key + ':isrc'),
			});

			snapshotPayload.tracks.forEach((t: any) => {
				if (t.id && provisionedIsrcs.has(t.id)) {
					t.isrc = provisionedIsrcs.get(t.id)!.value;
				}
			});

			await this.uow.run(async (ctx) => {
				await ctx.manager.update(
					'release_snapshot',
					{ id: dist.snapshotId },
					{ payload: snapshotPayload },
				);
			});
		}

		// ── 2. UPC: idempotency guard rồi mới resolve ──
		// Guard chỉ skip UPC provisioning (ISRC đã xử lý xong ở trên).
		if (dist.upc) {
			return {
				type: 'MARK_IDS_PROVISIONED',
				distributionId: dist.id,
				key: `${payload.key}:done`,
				upc: dist.upc,
			};
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
