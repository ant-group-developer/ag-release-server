import { Test } from '@nestjs/testing';

import { ChannelDelivery } from '../../../domain/channel-delivery/channel-delivery.entity';
import { ChannelInputType } from '../../../domain/channel-delivery/channel-interpreter.types';
import { ChannelState } from '../../../domain/channel-delivery/channel-state.enum';
import { ChannelTopology } from '../../../domain/channel-delivery/channel-topology.enum';
import { Distribution } from '../../../domain/distribution/distribution.aggregate';
import { DISTRIBUTION_REPOSITORY } from '../../ports/distribution-repository.port';
import { UNIT_OF_WORK } from '../../ports/unit-of-work.port';
import { ChannelJobPayload } from '../runner-payload';
import { EXPORTER, ExportBatchRunner } from '../export-batch.runner';

/**
 * ExportBatchRunner — trọng tâm: cluster CI export 1 lần/DISTINCT method (deal+state51 trộn),
 * channel thường export theo spec.exportMethod của chính nó.
 */
describe('ExportBatchRunner', () => {
	let runner: ExportBatchRunner;
	let mockUow: any;
	let mockRepo: any;
	let mockExporter: any;

	beforeEach(async () => {
		mockUow = { run: jest.fn((cb) => cb({})) };
		mockRepo = { load: jest.fn() };
		mockExporter = { export: jest.fn().mockResolvedValue({ jobId: 'j1' }) };

		const module = await Test.createTestingModule({
			providers: [
				ExportBatchRunner,
				{ provide: UNIT_OF_WORK, useValue: mockUow },
				{ provide: DISTRIBUTION_REPOSITORY, useValue: mockRepo },
				{ provide: EXPORTER, useValue: mockExporter },
			],
		}).compile();

		runner = module.get(ExportBatchRunner);
	});

	const baseDist = (): Distribution => {
		const dist = Distribution.create({
			id: 'dist-1',
			releaseId: 'release-1',
			snapshotId: 'snap-1',
			tenantId: 'tenant-1',
			type: 'INITIAL_RELEASE' as any,
			correlationId: 'corr-1',
			channelSpecs: [],
		});
		(dist as any)._state = 'DELIVERING';
		(dist as any)._upc = '123456789012';
		return dist;
	};

	const payload = (): ChannelJobPayload => ({
		distributionId: 'dist-1',
		channelId: 'dist-1:ch:0',
		key: 'export:dist-1:ch:0',
		correlationId: 'corr-1',
	});

	it('cluster trộn deal + state51 → export 1 lần MỖI distinct method', async () => {
		const dist = baseDist();
		const cluster = ChannelDelivery.createCluster(
			'dist-1:ch:0',
			{
				dspCode: 'CI',
				topology: ChannelTopology.VIA_AGGREGATOR,
				processCode: 'ci.cluster.initial',
				aggregatorCode: 'CI',
			},
			[
				{ dspCode: 'APPLE', exportMethod: 'STATE51', hasDeal: false },
				{ dspCode: 'FACEBOOK', exportMethod: 'CI_DEAL', hasDeal: true },
				{ dspCode: 'TIKTOK', exportMethod: 'CI_DEAL', hasDeal: true }, // trùng CI_DEAL
			],
		);
		// đưa cluster tới stage export (pos 3, WAIT EXPORT)
		(cluster as any)._pos = 3;
		(cluster as any)._state = ChannelState.WAITING;
		(dist as any)._channels = [cluster];
		mockRepo.load.mockResolvedValue(dist);

		await runner.run(payload());

		// 3 member nhưng chỉ 2 distinct method (STATE51 + CI_DEAL) → export gọi 2 lần.
		expect(mockExporter.export).toHaveBeenCalledTimes(2);
		const methods = mockExporter.export.mock.calls.map((c: any) => c[0].method);
		expect(new Set(methods)).toEqual(new Set(['STATE51', 'CI_DEAL']));
	});

	it('channel thường → export theo spec.exportMethod của chính nó', async () => {
		const dist = baseDist();
		const channel = ChannelDelivery.rehydrate(
			{
				dspCode: 'APPLE',
				topology: ChannelTopology.VIA_AGGREGATOR,
				processCode: 'ci.deal.initial',
				aggregatorCode: 'CI',
				exportMethod: 'CI_DEAL',
			},
			{
				channelId: 'dist-1:ch:0',
				pos: 3,
				state: ChannelState.WAITING,
				retryCount: 0,
			},
		);
		(dist as any)._channels = [channel];
		mockRepo.load.mockResolvedValue(dist);

		const result = await runner.run(payload());

		expect(mockExporter.export).toHaveBeenCalledTimes(1);
		expect(mockExporter.export).toHaveBeenCalledWith(
			expect.objectContaining({ method: 'CI_DEAL', upcs: ['123456789012'] }),
		);
		expect(result.input).toEqual({ type: ChannelInputType.ARRIVED });
	});
});
