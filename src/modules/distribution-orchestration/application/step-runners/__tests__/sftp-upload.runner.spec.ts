import { Test } from '@nestjs/testing';

import { ChannelDelivery } from '../../../domain/channel-delivery/channel-delivery.entity';
import { ChannelDeliverySpec } from '../../../domain/channel-delivery/channel-delivery-spec';
import { ChannelInputType } from '../../../domain/channel-delivery/channel-interpreter.types';
import { ChannelState } from '../../../domain/channel-delivery/channel-state.enum';
import { ChannelTopology } from '../../../domain/channel-delivery/channel-topology.enum';
import { Distribution } from '../../../domain/distribution/distribution.aggregate';
import { TicketService } from '../../../domain/ports/ticket-service.port';
import { TicketReason, TicketRef } from '../../../domain/value-objects/ticket-ref.vo';
import { DISTRIBUTION_REPOSITORY } from '../../ports/distribution-repository.port';
import { UNIT_OF_WORK } from '../../ports/unit-of-work.port';
import { TICKET_SERVICE } from '../../../infrastructure/adapters/postgres-ticket.adapter';
import { PACKAGE_UPLOADER, SftpUploadRunner } from '../sftp-upload.runner';
import { ChannelJobPayload } from '../runner-payload';

describe('SftpUploadRunner', () => {
	let runner: SftpUploadRunner;
	let mockUow: any;
	let mockRepo: any;
	let mockUploader: any;
	let mockTicketService: jest.Mocked<TicketService>;

	beforeEach(async () => {
		mockUow = { run: jest.fn((cb) => cb({})) };
		mockRepo = { load: jest.fn() };
		mockUploader = { upload: jest.fn(), markBatchDone: jest.fn() };
		mockTicketService = {
			open: jest.fn(),
			resolve: jest.fn(),
		};

		const module = await Test.createTestingModule({
			providers: [
				SftpUploadRunner,
				{ provide: UNIT_OF_WORK, useValue: mockUow },
				{ provide: DISTRIBUTION_REPOSITORY, useValue: mockRepo },
				{ provide: PACKAGE_UPLOADER, useValue: mockUploader },
				{ provide: TICKET_SERVICE, useValue: mockTicketService },
			],
		}).compile();

		runner = module.get(SftpUploadRunner);
	});

	const SPEC: ChannelDeliverySpec = {
		dspCode: 'SPOTIFY',
		topology: ChannelTopology.DIRECT,
		processCode: 'spotify.initial', // stage 0 = 'deliver' ACTION retryable, RetryPolicy 3 attempts
	};

	/**
	 * Build a DELIVERING distribution with ONE real ChannelDelivery sitting on the 'deliver'
	 * ACTION stage (pos 0). `retryCount` seeds the interpreter's failure counter so we can drive
	 * the runner across the retry boundary (default RetryPolicy = 3 attempts → exhaust at 3rd fail).
	 */
	const createDistribution = (channelRetryCount = 0): Distribution => {
		const dist = Distribution.create({
			id: 'dist-1',
			releaseId: 'release-1',
			snapshotId: 'snap-1',
			tenantId: 'tenant-1',
			type: 'INITIAL_RELEASE' as any,
			correlationId: 'corr-1',
			channelSpecs: [],
		});

		const channel = ChannelDelivery.rehydrate(SPEC, {
			channelId: 'ch-1',
			pos: 0,
			state: ChannelState.DELIVERING,
			retryCount: channelRetryCount,
		});

		(dist as any)._state = 'DELIVERING';
		(dist as any)._packageUri = 's3://packages/dist-1.zip';
		(dist as any)._channels = [channel];

		return dist;
	};

	const createPayload = (): ChannelJobPayload => ({
		distributionId: 'dist-1',
		channelId: 'ch-1',
		key: 'upload:dist-1:ch-1',
		correlationId: 'corr-1',
	});

	it('upload success → STEP_DONE', async () => {
		const dist = createDistribution();
		mockRepo.load.mockResolvedValue(dist);
		mockUploader.upload.mockResolvedValue({ ok: true });

		const result = await runner.run(createPayload());

		expect(result).toEqual({
			type: 'APPLY_CHANNEL_INPUT',
			distributionId: 'dist-1',
			key: 'upload:dist-1:ch-1:done',
			channelId: 'ch-1',
			input: { type: ChannelInputType.STEP_DONE },
		});
		expect(mockTicketService.open).not.toHaveBeenCalled();
	});

	it('upload fail but retry budget left → ACTION_FAIL WITHOUT ticket (no orphan)', async () => {
		// retryCount 0 → next fail = attempt 1 of 3 → interpreter retries in place, NOT ISSUES.
		const dist = createDistribution(0);
		mockRepo.load.mockResolvedValue(dist);
		mockUploader.upload.mockResolvedValue({ ok: false });

		const result = await runner.run(createPayload());

		// No ticket opened while retries remain — opening one here would orphan it.
		expect(mockTicketService.open).not.toHaveBeenCalled();
		expect(result).toEqual({
			type: 'APPLY_CHANNEL_INPUT',
			distributionId: 'dist-1',
			key: 'upload:dist-1:ch-1:fail',
			channelId: 'ch-1',
			input: { type: ChannelInputType.ACTION_FAIL },
		});
		expect((result as any).input.ticketRef).toBeUndefined();
	});

	it('upload fail on LAST attempt (exhausted) → open ticket + ACTION_FAIL + ticketRef', async () => {
		// retryCount 2 → next fail = attempt 3 of 3 → interpreter goes to ISSUES → needs ticket.
		const dist = createDistribution(2);
		mockRepo.load.mockResolvedValue(dist);
		mockUploader.upload.mockResolvedValue({ ok: false });
		mockTicketService.open.mockResolvedValue(TicketRef.create('ticket-123'));

		const result = await runner.run(createPayload());

		expect(mockTicketService.open).toHaveBeenCalledWith({
			distributionId: 'dist-1',
			channelId: 'ch-1',
			reason: TicketReason.UPLOAD_FAIL,
			detail: expect.stringContaining('SFTP upload failed'),
			key: expect.objectContaining({ value: 'ch-1:UPLOAD_FAIL:g0' }),
		});
		expect(result).toEqual({
			type: 'APPLY_CHANNEL_INPUT',
			distributionId: 'dist-1',
			key: 'upload:dist-1:ch-1:fail',
			channelId: 'ch-1',
			input: {
				type: ChannelInputType.ACTION_FAIL,
				ticketRef: 'ticket-123',
			},
		});
	});

	it('VIA_AGGREGATOR → markBatchDone after successful upload', async () => {
		const dist = Distribution.create({
			id: 'dist-1',
			releaseId: 'release-1',
			snapshotId: 'snap-1',
			tenantId: 'tenant-1',
			type: 'INITIAL_RELEASE' as any,
			correlationId: 'corr-1',
			channelSpecs: [],
		});
		const channel = ChannelDelivery.rehydrate(
			{
				dspCode: 'SPOTIFY',
				topology: ChannelTopology.VIA_AGGREGATOR,
				processCode: 'ci.deal.initial',
				aggregatorCode: 'CI',
			},
			{
				channelId: 'ch-1',
				pos: 0,
				state: ChannelState.DELIVERING,
				retryCount: 0,
			},
		);
		(dist as any)._state = 'DELIVERING';
		(dist as any)._packageUri = 's3://packages/dist-1.zip';
		(dist as any)._channels = [channel];

		mockRepo.load.mockResolvedValue(dist);
		mockUploader.upload.mockResolvedValue({ ok: true });

		await runner.run(createPayload());

		expect(mockUploader.markBatchDone).toHaveBeenCalledWith({
			path: expect.any(Object),
			dspCode: expect.any(Object),
			key: expect.any(Object),
		});
	});

	it('aggregate not found → throw', async () => {
		mockRepo.load.mockResolvedValue(null);
		await expect(runner.run(createPayload())).rejects.toThrow(
			'Distribution dist-1 not found',
		);
	});

	it('channel not found → throw', async () => {
		const dist = createDistribution();
		mockRepo.load.mockResolvedValue(dist);
		await expect(
			runner.run({ ...createPayload(), channelId: 'wrong-ch' }),
		).rejects.toThrow('channel wrong-ch not found');
	});

	it('missing packageUri → throw', async () => {
		const dist = createDistribution();
		(dist as any)._packageUri = null;
		mockRepo.load.mockResolvedValue(dist);
		await expect(runner.run(createPayload())).rejects.toThrow(
			'missing packageUri',
		);
	});
});
