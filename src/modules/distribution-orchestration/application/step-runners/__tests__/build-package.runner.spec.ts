import { Test } from '@nestjs/testing';

import { Distribution } from '../../../domain/distribution/distribution.aggregate';
import { DefaultPolicyResolver, POLICY_RESOLVER } from '../../policy-resolver';
import { DISTRIBUTION_REPOSITORY } from '../../ports/distribution-repository.port';
import { UNIT_OF_WORK } from '../../ports/unit-of-work.port';
import { JobPayload } from '../../ports/workflow-engine.port';
import { BuildPackageRunner, PACKAGE_BUILDER } from '../build-package.runner';

/**
 * BuildPackageRunner — trọng tâm test: gom nhóm theo dspRoute (1 package/nhóm) + idempotency guard.
 * builder.build() sinh batchId/folder MỚI + re-download media mỗi lần, nên runner PHẢI skip
 * build khi đã build (job redeliver / retry trước khi command commit).
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
				{ provide: POLICY_RESOLVER, useClass: DefaultPolicyResolver },
			],
		}).compile();

		runner = module.get(BuildPackageRunner);
	});

	// processCode='' mirrors the real submit flow: DspSpecResolverAdapter leaves it empty,
	// the aggregate only fills it on entering DELIVERING (after BUILDING_PACKAGE). The runner
	// must resolve it via policy itself, else builder gets '' → parseProcessCode throws.
	const createDistribution = (
		packageUris?: Record<string, string>,
		channelSpecs?: any[],
	): Distribution => {
		const dist = Distribution.create({
			id: 'dist-1',
			releaseId: 'release-1',
			snapshotId: 'snap-1',
			tenantId: 'tenant-1',
			type: 'INITIAL_RELEASE' as any,
			correlationId: 'corr-1',
			channelSpecs: channelSpecs ?? [
				{
					dspCode: 'SPOTIFY',
					topology: 'DIRECT',
					processCode: '',
				} as any,
			],
		});
		if (packageUris) (dist as any)._packageUris = packageUris;
		return dist;
	};

	const payload: JobPayload = {
		distributionId: 'dist-1',
		correlationId: 'corr-1',
		key: 'build:dist-1',
	};

	it('builds 1 package for single group, returns MARK_PACKAGE_BUILT map', async () => {
		mockRepo.load.mockResolvedValue(createDistribution());
		mockBuilder.build.mockResolvedValue({ uri: 'local://20260723/upc' });

		const result = await runner.run(payload);

		expect(mockBuilder.build).toHaveBeenCalledTimes(1);
		// Empty spec.processCode resolved via policy → 'spotify.initial' (DIRECT + INITIAL_RELEASE).
		expect(mockBuilder.build).toHaveBeenCalledWith(
			expect.objectContaining({ processCode: 'spotify.initial' }),
		);
		expect(result).toEqual({
			type: 'MARK_PACKAGE_BUILT',
			distributionId: 'dist-1',
			key: 'build:dist-1:done',
			packageUris: { SPOTIFY: 'local://20260723/upc' },
		});
	});

	it('builds 1 package PER dspRoute group (Spotify direct + CI aggregator)', async () => {
		mockRepo.load.mockResolvedValue(
			createDistribution(undefined, [
				{ dspCode: 'SPOTIFY', topology: 'DIRECT', processCode: '' },
				{
					dspCode: 'APPLE',
					topology: 'VIA_AGGREGATOR',
					processCode: '',
					aggregatorCode: 'CI',
					hasDeal: false,
				},
				{
					dspCode: 'FACEBOOK',
					topology: 'VIA_AGGREGATOR',
					processCode: '',
					aggregatorCode: 'CI',
					hasDeal: true,
				},
			]),
		);
		// build trả uri khác nhau theo lần gọi (nhóm SPOTIFY rồi CI).
		mockBuilder.build
			.mockResolvedValueOnce({ uri: 'local://spotify/upc' })
			.mockResolvedValueOnce({ uri: 'local://ci/upc' });

		const result = await runner.run(payload);

		// 2 nhóm → 2 build (Apple + Facebook gộp CI, không build 3 lần).
		expect(mockBuilder.build).toHaveBeenCalledTimes(2);
		expect(result).toEqual({
			type: 'MARK_PACKAGE_BUILT',
			distributionId: 'dist-1',
			key: 'build:dist-1:done',
			packageUris: {
				SPOTIFY: 'local://spotify/upc',
				CI: 'local://ci/upc',
			},
		});
	});

	it('idempotency guard: skips build when packages already built', async () => {
		mockRepo.load.mockResolvedValue(
			createDistribution({ SPOTIFY: 'local://existing/upc' }),
		);

		const result = await runner.run(payload);

		// KHÔNG build lại (tránh sinh folder mới + re-download media khi redeliver).
		expect(mockBuilder.build).not.toHaveBeenCalled();
		expect(result).toEqual({
			type: 'MARK_PACKAGE_BUILT',
			distributionId: 'dist-1',
			key: 'build:dist-1:done',
			packageUris: { SPOTIFY: 'local://existing/upc' },
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
