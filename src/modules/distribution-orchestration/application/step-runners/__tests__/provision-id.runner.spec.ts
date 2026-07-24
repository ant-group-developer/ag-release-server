import { Test } from '@nestjs/testing';

import { Distribution } from '../../../domain/distribution/distribution.aggregate';
import { DISTRIBUTION_REPOSITORY } from '../../ports/distribution-repository.port';
import { UNIT_OF_WORK } from '../../ports/unit-of-work.port';
import { JobPayload } from '../../ports/workflow-engine.port';
import { IDENTIFIER_PROVISIONER, ProvisionIdRunner } from '../provision-id.runner';

/**
 * ProvisionIdRunner — trọng tâm test: idempotency guard.
 * getUpc() cấp GTIN MỚI mỗi lần (không get-or-create theo releaseId), nên runner PHẢI
 * skip provisioner khi dist.upc đã set (job redeliver / retry trước khi command commit).
 */
describe('ProvisionIdRunner', () => {
	let runner: ProvisionIdRunner;
	let mockUow: any;
	let mockRepo: any;
	let mockProvisioner: any;
	let mockSnapshotReader: any;

	beforeEach(async () => {
		mockUow = { run: jest.fn((cb) => cb({})) };
		mockRepo = { load: jest.fn() };
		mockProvisioner = {
			provisionUpc: jest.fn(),
			provisionIsrcs: jest.fn().mockResolvedValue(new Map()),
		};
		mockSnapshotReader = { loadById: jest.fn() };

		const module = await Test.createTestingModule({
			providers: [
				ProvisionIdRunner,
				{ provide: UNIT_OF_WORK, useValue: mockUow },
				{ provide: DISTRIBUTION_REPOSITORY, useValue: mockRepo },
				{ provide: IDENTIFIER_PROVISIONER, useValue: mockProvisioner },
				{ provide: 'RELEASE_SNAPSHOT_READER', useValue: mockSnapshotReader },
			],
		}).compile();

		runner = module.get(ProvisionIdRunner);
	});

	const createDistribution = (upc?: string): Distribution => {
		const dist = Distribution.create({
			id: 'dist-1',
			releaseId: 'release-1',
			snapshotId: 'snap-1',
			tenantId: 'tenant-1',
			type: 'INITIAL_RELEASE' as any,
			correlationId: 'corr-1',
			channelSpecs: [],
		});
		if (upc) (dist as any)._upc = upc;
		return dist;
	};

	const payload: JobPayload = {
		distributionId: 'dist-1',
		correlationId: 'corr-1',
		key: 'provision:dist-1',
	};

	it('provisions UPC when not yet set, returns MARK_IDS_PROVISIONED', async () => {
		mockRepo.load.mockResolvedValue(createDistribution());
		mockProvisioner.provisionUpc.mockResolvedValue({ value: '0850080651804' });

		const result = await runner.run(payload);

		expect(mockProvisioner.provisionUpc).toHaveBeenCalledTimes(1);
		expect(result).toEqual({
			type: 'MARK_IDS_PROVISIONED',
			distributionId: 'dist-1',
			key: 'provision:dist-1:done',
			upc: '0850080651804',
		});
	});

	it('idempotency guard: skips provisioner when UPC already set', async () => {
		mockRepo.load.mockResolvedValue(createDistribution('0850080651804'));

		const result = await runner.run(payload);

		// KHÔNG gọi gRPC lần nữa (tránh cấp GTIN trùng khi redeliver).
		expect(mockProvisioner.provisionUpc).not.toHaveBeenCalled();
		expect(result).toEqual({
			type: 'MARK_IDS_PROVISIONED',
			distributionId: 'dist-1',
			key: 'provision:dist-1:done',
			upc: '0850080651804',
		});
	});

	it('throws AggregateNotFound when distribution missing', async () => {
		mockRepo.load.mockResolvedValue(null);

		await expect(runner.run(payload)).rejects.toThrow();
	});
});
