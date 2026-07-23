import { Test } from '@nestjs/testing';

import { Distribution } from '../../../domain/distribution/distribution.aggregate';
import { DISTRIBUTION_REPOSITORY } from '../../ports/distribution-repository.port';
import { UNIT_OF_WORK } from '../../ports/unit-of-work.port';
import { JobPayload } from '../../ports/workflow-engine.port';
import { BuildPackageRunner, PACKAGE_BUILDER } from '../build-package.runner';

/**
 * BuildPackageRunner — trọng tâm test: idempotency guard.
 * builder.build() sinh batchId/folder MỚI + re-download media mỗi lần, nên runner PHẢI skip
 * build khi dist.packageUri đã set (job redeliver / retry trước khi command commit).
 */
describe('BuildPackageRunner', () => {
	let runner: BuildPackageRunner;
	let mockUow: any;
	let mockRepo: any;
	let mockBuilder: any;

	beforeEach(async () => {
		mockUow = { run: jest.fn((cb) => cb({})) };
		mockRepo = { load: jest.fn() };
		mockBuilder = { build: jest.fn() };

		const module = await Test.createTestingModule({
			providers: [
				BuildPackageRunner,
				{ provide: UNIT_OF_WORK, useValue: mockUow },
				{ provide: DISTRIBUTION_REPOSITORY, useValue: mockRepo },
				{ provide: PACKAGE_BUILDER, useValue: mockBuilder },
			],
		}).compile();

		runner = module.get(BuildPackageRunner);
	});

	const createDistribution = (packageUri?: string): Distribution => {
		const dist = Distribution.create({
			id: 'dist-1',
			releaseId: 'release-1',
			snapshotId: 'snap-1',
			tenantId: 'tenant-1',
			type: 'INITIAL_RELEASE' as any,
			correlationId: 'corr-1',
			channelSpecs: [
				{
					dspCode: 'SPOTIFY',
					topology: 'VIA_AGGREGATOR',
					processCode: 'fuga.spotify',
					aggregatorCode: 'FUGA',
				} as any,
			],
		});
		if (packageUri) (dist as any)._packageUri = packageUri;
		return dist;
	};

	const payload: JobPayload = {
		distributionId: 'dist-1',
		correlationId: 'corr-1',
		key: 'build:dist-1',
	};

	it('builds package when not yet built, returns MARK_PACKAGE_BUILT', async () => {
		mockRepo.load.mockResolvedValue(createDistribution());
		mockBuilder.build.mockResolvedValue({ uri: 'local://20260723/upc' });

		const result = await runner.run(payload);

		expect(mockBuilder.build).toHaveBeenCalledTimes(1);
		expect(result).toEqual({
			type: 'MARK_PACKAGE_BUILT',
			distributionId: 'dist-1',
			key: 'build:dist-1:done',
			packageUri: 'local://20260723/upc',
		});
	});

	it('idempotency guard: skips build when packageUri already set', async () => {
		mockRepo.load.mockResolvedValue(
			createDistribution('local://existing/upc'),
		);

		const result = await runner.run(payload);

		// KHÔNG build lại (tránh sinh folder mới + re-download media khi redeliver).
		expect(mockBuilder.build).not.toHaveBeenCalled();
		expect(result).toEqual({
			type: 'MARK_PACKAGE_BUILT',
			distributionId: 'dist-1',
			key: 'build:dist-1:done',
			packageUri: 'local://existing/upc',
		});
	});

	it('throws when distribution has no channelSpecs', async () => {
		const dist = Distribution.create({
			id: 'dist-1',
			releaseId: 'release-1',
			snapshotId: 'snap-1',
			tenantId: 'tenant-1',
			type: 'INITIAL_RELEASE' as any,
			correlationId: 'corr-1',
			channelSpecs: [],
		});
		mockRepo.load.mockResolvedValue(dist);

		await expect(runner.run(payload)).rejects.toThrow(/no channelSpecs/);
	});
});
