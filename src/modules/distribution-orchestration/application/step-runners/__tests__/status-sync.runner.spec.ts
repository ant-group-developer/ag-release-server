import { Test } from '@nestjs/testing';

import { ChannelInputType } from '../../../domain/channel-delivery/channel-interpreter.types';
import { Distribution } from '../../../domain/distribution/distribution.aggregate';
import { TicketService } from '../../../domain/ports/ticket-service.port';
import { TicketReason, TicketRef } from '../../../domain/value-objects/ticket-ref.vo';
import { DISTRIBUTION_REPOSITORY } from '../../ports/distribution-repository.port';
import { UNIT_OF_WORK } from '../../ports/unit-of-work.port';
import { TICKET_SERVICE } from '../../../infrastructure/adapters/postgres-ticket.adapter';
import { DELIVERY_STATUS_READER, StatusSyncRunner } from '../status-sync.runner';
import { ChannelJobPayload } from '../runner-payload';

describe('StatusSyncRunner', () => {
	let runner: StatusSyncRunner;
	let mockUow: any;
	let mockRepo: any;
	let mockReader: any;
	let mockTicketService: jest.Mocked<TicketService>;

	beforeEach(async () => {
		mockUow = { run: jest.fn((cb) => cb({})) };
		mockRepo = { load: jest.fn() };
		mockReader = { read: jest.fn() };
		mockTicketService = {
			open: jest.fn(),
			resolve: jest.fn(),
		};

		const module = await Test.createTestingModule({
			providers: [
				StatusSyncRunner,
				{ provide: UNIT_OF_WORK, useValue: mockUow },
				{ provide: DISTRIBUTION_REPOSITORY, useValue: mockRepo },
				{ provide: DELIVERY_STATUS_READER, useValue: mockReader },
				{ provide: TICKET_SERVICE, useValue: mockTicketService },
			],
		}).compile();

		runner = module.get(StatusSyncRunner);
	});

	const createDistribution = (): Distribution => {
		const dist = Distribution.create({
			id: 'dist-1',
			releaseId: 'release-1',
			snapshotId: 'snap-1',
			tenantId: 'tenant-1',
			type: 'INITIAL_RELEASE' as any,
			correlationId: 'corr-1',
			channelSpecs: [],
		});

		// Simulate DELIVERING state with channels spawned + UPC set
		(dist as any)._state = 'DELIVERING';
		(dist as any)._upc = 'upc-123';
		(dist as any)._channels = [
			{
				channelId: 'ch-1',
				spec: {
					dspCode: 'SPOTIFY',
					topology: 'DIRECT',
					processCode: 'spotify.initial',
				},
			},
		];

		return dist;
	};

	const createPayload = (): ChannelJobPayload => ({
		distributionId: 'dist-1',
		channelId: 'ch-1',
		key: 'status:dist-1:ch-1',
		correlationId: 'corr-1',
	});

	it('status pending → return null (re-poll)', async () => {
		const dist = createDistribution();
		const payload = createPayload();

		mockRepo.load.mockResolvedValue(dist);
		mockReader.read.mockResolvedValue(new Map([['SPOTIFY', 'pending']]));

		const result = await runner.run(payload);

		expect(result).toBeNull();
		expect(mockReader.read).toHaveBeenCalledWith({
			upc: 'upc-123',
			dspCodes: [expect.any(Object)],
		});
	});

	it('status live → ARRIVED', async () => {
		const dist = createDistribution();
		const payload = createPayload();

		mockRepo.load.mockResolvedValue(dist);
		mockReader.read.mockResolvedValue(new Map([['SPOTIFY', 'live']]));

		const result = await runner.run(payload);

		expect(result).toEqual({
			type: 'APPLY_CHANNEL_INPUT',
			distributionId: 'dist-1',
			key: 'status:dist-1:ch-1:done',
			channelId: 'ch-1',
			input: { type: ChannelInputType.ARRIVED },
		});
	});

	it('status rejected → open ticket + WAIT_FAIL', async () => {
		const dist = createDistribution();
		const payload = createPayload();

		mockRepo.load.mockResolvedValue(dist);
		mockReader.read.mockResolvedValue(new Map([['SPOTIFY', 'rejected']]));
		mockTicketService.open.mockResolvedValue(TicketRef.create('ticket-abc'));

		const result = await runner.run(payload);

		expect(mockTicketService.open).toHaveBeenCalledWith({
			distributionId: 'dist-1',
			channelId: 'ch-1',
			reason: TicketReason.PARTNER_FAIL,
			detail: expect.stringContaining('DSP SPOTIFY rejected'),
			// Stable key: channel:reason:g{retryCount} — NOT derived from drifting payload.key.
			key: expect.objectContaining({ value: 'ch-1:PARTNER_FAIL:g0' }),
		});

		expect(result).toEqual({
			type: 'APPLY_CHANNEL_INPUT',
			distributionId: 'dist-1',
			key: 'status:dist-1:ch-1:fail',
			channelId: 'ch-1',
			input: {
				type: ChannelInputType.WAIT_FAIL,
				ticketRef: 'ticket-abc',
			},
		});
	});

	it('status not in map → default pending → return null', async () => {
		const dist = createDistribution();
		const payload = createPayload();

		mockRepo.load.mockResolvedValue(dist);
		mockReader.read.mockResolvedValue(new Map()); // empty map

		const result = await runner.run(payload);

		expect(result).toBeNull();
	});

	it('missing UPC → throw', async () => {
		const dist = createDistribution();
		(dist as any)._upc = null;
		const payload = createPayload();

		mockRepo.load.mockResolvedValue(dist);

		await expect(runner.run(payload)).rejects.toThrow('UPC not set');
	});

	it('aggregate not found → throw', async () => {
		mockRepo.load.mockResolvedValue(null);

		await expect(runner.run(createPayload())).rejects.toThrow(
			'Distribution dist-1 not found',
		);
	});
});
