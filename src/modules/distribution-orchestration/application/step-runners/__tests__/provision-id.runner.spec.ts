import { Test } from '@nestjs/testing';

import { Distribution } from '../../../domain/distribution/distribution.aggregate';
import { DISTRIBUTION_REPOSITORY } from '../../ports/distribution-repository.port';
import { RELEASE_SNAPSHOT_READER } from '../../ports/release-snapshot-reader.port';
import { UNIT_OF_WORK } from '../../ports/unit-of-work.port';
import { JobPayload } from '../../ports/workflow-engine.port';
import {
	IDENTIFIER_PROVISIONER,
	ProvisionIdRunner,
} from '../provision-id.runner';

/**
 * ProvisionIdRunner — trọng tâm test:
 *   · ISRC provisioning luôn chạy trước UPC guard (fix bug skip ISRC khi dist.upc đã set).
 *   · UPC idempotency guard: skip provisionUpc khi dist.upc đã set.
 *   · UPC resolve: dùng snapshot.upc nếu user đã nhập.
 */
describe('ProvisionIdRunner', () => {
	let runner: ProvisionIdRunner;
	let mockUow: any;
	let mockRepo: any;
	let mockProvisioner: any;
	let mockSnapshotReader: any;

	beforeEach(async () => {
		mockUow = {
			run: jest.fn((cb) => cb({ manager: { update: jest.fn() } })),
		};
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
				{
					provide: RELEASE_SNAPSHOT_READER,
					useValue: mockSnapshotReader,
				},
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

	/** Snapshot mặc định: tracks đã có ISRC, chưa có UPC. */
	const defaultSnapshot = () => ({
		payload: {
			tracks: [{ id: 'track-1', isrc: 'USTEST0000001', title: 'Song 1' }],
		},
	});

	const payload: JobPayload = {
		distributionId: 'dist-1',
		correlationId: 'corr-1',
		key: 'provision:dist-1',
	};

	it('provisions UPC when not yet set, returns MARK_IDS_PROVISIONED', async () => {
		mockRepo.load.mockResolvedValue(createDistribution());
		mockSnapshotReader.loadById.mockResolvedValue(defaultSnapshot());
		mockProvisioner.provisionUpc.mockResolvedValue({
			value: '0850080651804',
		});

		const result = await runner.run(payload);

		expect(mockProvisioner.provisionUpc).toHaveBeenCalledTimes(1);
		expect(result).toEqual({
			type: 'MARK_IDS_PROVISIONED',
			distributionId: 'dist-1',
			key: 'provision:dist-1:done',
			upc: '0850080651804',
		});
	});

	it('idempotency guard: skips provisionUpc when UPC already set, but still checks ISRCs', async () => {
		mockRepo.load.mockResolvedValue(createDistribution('0850080651804'));
		mockSnapshotReader.loadById.mockResolvedValue(defaultSnapshot());

		const result = await runner.run(payload);

		// UPC gRPC KHÔNG gọi (tránh cấp GTIN trùng khi redeliver).
		expect(mockProvisioner.provisionUpc).not.toHaveBeenCalled();
		// ISRC đã có trong snapshot → provisionIsrcs cũng không gọi (missingIsrcTracks rỗng).
		expect(mockProvisioner.provisionIsrcs).not.toHaveBeenCalled();
		expect(result).toEqual({
			type: 'MARK_IDS_PROVISIONED',
			distributionId: 'dist-1',
			key: 'provision:dist-1:done',
			upc: '0850080651804',
		});
	});

	it('provisions ISRCs even when dist.upc already set (crash recovery)', async () => {
		mockRepo.load.mockResolvedValue(createDistribution('0850080651804'));
		// Snapshot: track thiếu ISRC (lần trước snapshot update fail)
		mockSnapshotReader.loadById.mockResolvedValue({
			payload: {
				tracks: [{ id: 'track-1', title: 'Song 1' /* no isrc */ }],
			},
		});
		const isrcMap = new Map([['track-1', { value: 'USTEST0000001' }]]);
		mockProvisioner.provisionIsrcs.mockResolvedValue(isrcMap);

		const result = await runner.run(payload);

		// ISRC phải được provision dù dist.upc đã có
		expect(mockProvisioner.provisionIsrcs).toHaveBeenCalledTimes(1);
		// UPC KHÔNG gọi (guard giữ nguyên)
		expect(mockProvisioner.provisionUpc).not.toHaveBeenCalled();
		expect(result.upc).toBe('0850080651804');
	});

	it('uses snapshot.upc when user already provided UPC', async () => {
		mockRepo.load.mockResolvedValue(createDistribution());
		mockSnapshotReader.loadById.mockResolvedValue({
			payload: {
				upc: '123456789012',
				tracks: [{ id: 'track-1', isrc: 'USTEST0000001' }],
			},
		});

		const result = await runner.run(payload);

		expect(mockProvisioner.provisionUpc).not.toHaveBeenCalled();
		expect(result.upc).toBe('123456789012');
	});

	it('throws when tracks missing ISRC have no id field', async () => {
		mockRepo.load.mockResolvedValue(createDistribution());
		mockSnapshotReader.loadById.mockResolvedValue({
			payload: {
				tracks: [
					{ title: 'Song without ID or ISRC' /* no id, no isrc */ },
				],
			},
		});

		await expect(runner.run(payload)).rejects.toThrow(
			"missing ISRC but have no 'id' field",
		);
	});

	it('throws AggregateNotFound when distribution missing', async () => {
		mockRepo.load.mockResolvedValue(null);

		await expect(runner.run(payload)).rejects.toThrow();
	});
});
