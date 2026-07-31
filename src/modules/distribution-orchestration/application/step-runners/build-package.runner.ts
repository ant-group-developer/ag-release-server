import { Inject, Injectable } from '@nestjs/common';

import { PackageBuilder } from '../../domain/ports/package-builder.port';
import { IdempotencyKey } from '../../domain/value-objects/idempotency-key.vo';
import { MarkPackageBuiltCommand } from '../commands/distribution.command';
import { AggregateNotFoundError } from '../errors/aggregate-not-found.error';
import { POLICY_RESOLVER, PolicyResolver } from '../policy-resolver';
import {
	DISTRIBUTION_REPOSITORY,
	DistributionRepository,
} from '../ports/distribution-repository.port';
import { UNIT_OF_WORK, UnitOfWork } from '../ports/unit-of-work.port';
import { JobPayload } from '../ports/workflow-engine.port';
import { groupChannelsByRoute } from './group-channels-by-route';

/**
 * BuildPackageRunner — consumer của `dist.build-package`.
 *
 * Build DDEX ra 1 package/NHÓM PHÂN PHỐI → nhận map groupKey → PackagePath.uri.
 * 1 release có thể phát tới nhiều đích khác ernVersion/sender/SFTP (Spotify direct ERN 4.3
 * vs CI aggregator ERN 3.8.2) → KHÔNG thể dùng chung 1 XML. Gom channelSpecs theo dspRoute
 * (groupChannelsByRoute), build 1 package cho mỗi nhóm. VD 3 DSP (Spotify/Apple/Facebook)
 * → 2 package: SPOTIFY + CI. Mỗi channel upload đọc package của nhóm mình (SftpUploadRunner).
 *
 * BUILDING_PACKAGE chạy TRƯỚC DELIVERING nên channels CHƯA spawn → spec.processCode
 * còn rỗng (DspSpecResolverAdapter để trống, aggregate chỉ fill khi ensureChannelsSpawned
 * vào DELIVERING). Runner PHẢI tự resolve qua policy — giống hệt aggregate — nếu không
 * builder nhận processCode="" → parseProcessCode throw.
 */
export const PACKAGE_BUILDER = Symbol('PackageBuilder');

@Injectable()
export class BuildPackageRunner {
	constructor(
		@Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
		@Inject(DISTRIBUTION_REPOSITORY)
		private readonly repo: DistributionRepository,
		@Inject(PACKAGE_BUILDER) private readonly builder: PackageBuilder,
		@Inject(POLICY_RESOLVER) private readonly policies: PolicyResolver,
	) {}

	async run(payload: JobPayload): Promise<MarkPackageBuiltCommand> {
		const dist = await this.uow.run((ctx) =>
			this.repo.load(ctx, payload.distributionId),
		);
		if (!dist) throw new AggregateNotFoundError(payload.distributionId);
		if (dist.channelSpecs.length === 0) {
			throw new Error(
				`BuildPackageRunner: distribution ${dist.id} has no channelSpecs`,
			);
		}

		// Idempotency guard: nếu đã build (job redeliver / retry BullMQ trước khi
		// MARK_PACKAGE_BUILT commit) → KHÔNG build lại (builder sinh batchId/folder mới mỗi lần,
		// re-download media tốn kém). Trả lại map đã có → command idempotent.
		if (dist.hasBuiltPackages) {
			return {
				type: 'MARK_PACKAGE_BUILT',
				distributionId: dist.id,
				key: `${payload.key}:done`,
				packageUris: { ...dist.packageUris },
			};
		}

		// Gom channelSpecs theo dspRoute → 1 package/nhóm. Resolve processCode qua policy
		// (spec giữ rỗng tới DELIVERING) — mirror Distribution.ensureChannelsSpawned.
		const policy = this.policies.resolve(dist.type);
		const groups = groupChannelsByRoute(dist.channelSpecs, policy);

		// Build tuần tự từng nhóm (số nhóm nhỏ, mỗi build re-download media nặng — không đua
		// song song để tránh cạnh tranh I/O + trùng temp dir). key theo nhóm → idempotent per group.
		const packageUris: Record<string, string> = {};
		for (const group of groups) {
			const path = await this.builder.build({
				snapshotId: dist.snapshotId,
				processCode: group.processCode,
				key: IdempotencyKey.create(`${payload.key}:${group.groupKey}`),
			});
			packageUris[group.groupKey] = path.uri;
		}

		return {
			type: 'MARK_PACKAGE_BUILT',
			distributionId: dist.id,
			key: `${payload.key}:done`,
			packageUris,
		};
	}
}
