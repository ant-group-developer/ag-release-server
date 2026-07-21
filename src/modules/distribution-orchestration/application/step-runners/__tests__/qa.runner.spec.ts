import { Test } from '@nestjs/testing';

import { ChannelInputType } from '../../../domain/channel-delivery/channel-interpreter.types';
import { Distribution } from '../../../domain/distribution/distribution.aggregate';
import { TicketService } from '../../../domain/ports/ticket-service.port';
import { IdempotencyKey } from '../../../domain/value-objects/idempotency-key.vo';
import { TicketReason, TicketRef } from '../../../domain/value-objects/ticket-ref.vo';
import { DISTRIBUTION_REPOSITORY } from '../../ports/distribution-repository.port';
import { UNIT_OF_WORK } from '../../ports/unit-of-work.port';
import { TICKET_SERVICE } from '../../../infrastructure/adapters/postgres-ticket.adapter';
import { QA_CHECKER, QaRunner } from '../qa.runner';
import { ChannelJobPayload } from '../runner-payload';

describe('QaRunner', () => {
	let runner: QaRunner;
	let mockUow: any;
	let mockRepo: any;
	let mockChecker: any;
	let mockTicketService: jest.Mocked<TicketService>;

	beforeEach(async () => {
		mockUow = { run: jest.fn((cb) => cb({})) };
		mockRepo = { load: jest.fn() };
		mockChecker = { check: jest.fn() };
		mockTicketService = {
			open: jest.fn(),
			resolve: jest.fn(),
		};

		const module = await Test.createTestingModule({
			providers: [
				QaRunner,
				{ provide: UNIT_OF_WORK, useValue: mockUow },
				{ provide: DISTRIBUTION_REPOSITORY, useValue: mockRepo },
				{ provide: QA_CHECKER, useValue: mockChecker },
				{ provide: TICKET_SERVICE, useValue: mockTicketService },
			],
		}).compile();

		runner = module.get(QaRunner);
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
		key: 'qa:dist-1:ch-1',
		correlationId: 'corr-1',
	});

	it('QA clean → GATE_PASS', async () => {
		const dist = createDistribution();
		const payload = createPayload();

		mockRepo.load.mockResolvedValue(dist);
		mockChecker.check.mockResolvedValue({ kind: 'clean' });

		const result = await runner.run(payload);

		expect(result).toEqual({
			type: 'APPLY_CHANNEL_INPUT',
			distributionId: 'dist-1',
			key: 'qa:dist-1:ch-1:done',
			channelId: 'ch-1',
			input: { type: ChannelInputType.GATE_PASS },
		});
		expect(mockChecker.check).toHaveBeenCalledWith({
			upc: 'upc-123',
			key: expect.any(IdempotencyKey),
		});
	});

	it('QA flagged → open ticket + GATE_FAIL', async () => {
		const dist = createDistribution();
		const payload = createPayload();

		mockRepo.load.mockResolvedValue(dist);
		mockChecker.check.mockResolvedValue({
			kind: 'flagged',
			flags: ['AUD001', 'ISRC_CONFLICT'],
		});
		mockTicketService.open.mockResolvedValue(TicketRef.create('ticket-456'));

		const result = await runner.run(payload);

		expect(mockTicketService.open).toHaveBeenCalledWith({
			distributionId: 'dist-1',
			channelId: 'ch-1',
			reason: TicketReason.QA_FLAG,
			detail: 'QA flags: AUD001, ISRC_CONFLICT',
			// Stable key: channel:reason:g{retryCount} — NOT derived from drifting payload.key.
			key: expect.objectContaining({ value: 'ch-1:QA_FLAG:g0' }),
		});

		expect(result).toEqual({
			type: 'APPLY_CHANNEL_INPUT',
			distributionId: 'dist-1',
			key: 'qa:dist-1:ch-1:fail',
			channelId: 'ch-1',
			input: {
				type: ChannelInputType.GATE_FAIL,
				ticketRef: 'ticket-456',
			},
		});
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
