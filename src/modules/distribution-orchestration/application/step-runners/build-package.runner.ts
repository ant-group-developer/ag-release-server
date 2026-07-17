import { Inject, Injectable } from '@nestjs/common';

import { PackageBuilder } from '../../domain/ports/package-builder.port';
import { IdempotencyKey } from '../../domain/value-objects/idempotency-key.vo';
import { MarkPackageBuiltCommand } from '../commands/distribution.command';
import { AggregateNotFoundError } from '../errors/aggregate-not-found.error';
import {
	DISTRIBUTION_REPOSITORY,
	DistributionRepository,
} from '../ports/distribution-repository.port';
import { UNIT_OF_WORK, UnitOfWork } from '../ports/unit-of-work.port';
import { JobPayload } from '../ports/workflow-engine.port';

/**
 * BuildPackageRunner — consumer của `dist.build-package`.
 *
 * Build DDEX + upload folder GCS/S3 → nhận PackagePath.uri.
 * processCode ở đây là ẩn — build không cần biết DSP; nhưng port PackageBuilder
 * yêu cầu processCode. Chọn processCode DUY NHẤT theo distribution: aggregate
 * KHÔNG lộ processCode chung → pick spec đầu tiên (mọi channel cùng release share
 * cùng bộ media asset, sự khác biệt chỉ ở XML layout — chọn processCode đầu ổn cho
 * runner này; real adapter Phase 4 sẽ tách nhánh theo topology nếu cần).
 */
export const PACKAGE_BUILDER = Symbol('PackageBuilder');

@Injectable()
export class BuildPackageRunner {
	constructor(
		@Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
		@Inject(DISTRIBUTION_REPOSITORY)
		private readonly repo: DistributionRepository,
		@Inject(PACKAGE_BUILDER) private readonly builder: PackageBuilder,
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

		const path = await this.builder.build({
			snapshotId: dist.snapshotId,
			processCode: dist.channelSpecs[0].processCode,
			key: IdempotencyKey.create(payload.key),
		});

		return {
			type: 'MARK_PACKAGE_BUILT',
			distributionId: dist.id,
			key: `${payload.key}:done`,
			packageUri: path.uri,
		};
	}
}
