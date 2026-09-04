import { BadRequestException } from '@nestjs/common';
import { Release } from 'src/modules/release/entities/release.entity';
import { AssetOwnershipTransferEvent } from '../entities/asset-ownership-transfer-event.entity';
import { AssetOwnershipService } from './asset-ownership.service';

describe('AssetOwnershipService', () => {
	let service: AssetOwnershipService;
	let manager: {
		findOne: jest.Mock;
		findOneOrFail: jest.Mock;
		save: jest.Mock;
		update: jest.Mock;
		create: jest.Mock;
		query: jest.Mock;
		exists: jest.Mock;
		createQueryBuilder: jest.Mock;
	};

	const RELEASE_ID = 'rel-1';
	const TENANT_A = 'tenant-a';
	const TENANT_B = 'tenant-b';
	const ACTOR = 'user-1';

	const makeRelease = (overrides: Record<string, unknown> = {}) => ({
		id: RELEASE_ID,
		tenantId: TENANT_A,
		labelId: 'LBL1',
		...overrides,
	});

	const makeOpenPeriod = (overrides: Record<string, unknown> = {}) => ({
		id: 'period-1',
		releaseId: RELEASE_ID,
		tenantId: TENANT_A,
		labelId: 'LBL1',
		effectiveFrom: '1900-01-01',
		effectiveTo: null,
		revenueEffectiveFrom: '1900-01-01',
		revenueEffectiveTo: null,
		...overrides,
	});

	beforeEach(() => {
		service = new AssetOwnershipService();
		manager = {
			findOne: jest.fn(),
			findOneOrFail: jest.fn(),
			save: jest.fn(async (_entity, value) => value ?? _entity),
			update: jest.fn(),
			create: jest.fn((_cls, value) => value),
			query: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
			exists: jest.fn(),
			createQueryBuilder: jest.fn(),
		};
		const qb = {
			setLock: jest.fn().mockReturnThis(),
			where: jest.fn().mockReturnThis(),
			orderBy: jest.fn().mockReturnThis(),
			getMany: jest.fn().mockResolvedValue([makeOpenPeriod()]),
		};
		manager.createQueryBuilder.mockReturnValue(qb);
		manager.findOne.mockImplementation(async (entity) => {
			if (entity === Release) return makeRelease();
			return null;
		});
	});

	it('truncates revenueEffectiveFrom to the first of the month', () => {
		expect(service.normalizeRevenueMonth('2026-09-15')).toBe('2026-09-01');
	});

	it('rejects a non ISO date', () => {
		expect(() => service.assertDate('2026-09-15T00:00:00Z', 'effectiveDate')).toThrow(
			BadRequestException,
		);
	});

	it('skips when open period already matches dest tenant and label', async () => {
		manager.findOne.mockResolvedValue(makeRelease({ tenantId: TENANT_B }));
		manager.createQueryBuilder().getMany.mockResolvedValue([
			makeOpenPeriod({ tenantId: TENANT_B, labelId: 'LBL1' }),
		]);

		const result = await service.transferMany(manager as never, {
			items: [{ releaseId: RELEASE_ID, labelId: 'LBL1' }],
			tenantId: TENANT_B,
			effectiveDate: '2026-09-01',
			revenueEffectiveFrom: '2026-09-01',
			source: 'channel_transfer',
			actorId: ACTOR,
			notify: false,
		});

		expect(result).toEqual({
			transferred: 0,
			skippedAlreadyDest: 1,
			labelCleared: 0,
			baselineCreated: 0,
		});
		expect(manager.update).not.toHaveBeenCalled();
	});

	it('closes the open period and writes source=channel_transfer without notifying when notify=false', async () => {
		manager.findOne.mockImplementation(async (entity) => {
			if (entity === AssetOwnershipTransferEvent) return null;
			if (entity === Release) return makeRelease();
			return null;
		});

		const result = await service.transferMany(manager as never, {
			items: [{ releaseId: RELEASE_ID, labelId: null }],
			tenantId: TENANT_B,
			effectiveDate: '2026-09-01',
			revenueEffectiveFrom: '2026-09-15',
			source: 'channel_transfer',
			actorId: ACTOR,
			notify: false,
		});

		expect(result.transferred).toBe(1);
		expect(result.labelCleared).toBe(1);
		expect(manager.query).toHaveBeenCalledWith(
			expect.stringContaining('clickhouse_sync_outbox'),
			[RELEASE_ID],
		);
		expect(manager.query).not.toHaveBeenCalledWith(
			expect.stringContaining('pg_notify'),
		);
		const eventSave = manager.save.mock.calls.find(
			(call) => call[0]?.name === 'AssetOwnershipTransferEvent' || call[1]?.source,
		);
		expect(eventSave?.[1]?.source ?? eventSave?.[0]?.source).toBe(
			'channel_transfer',
		);
		expect(eventSave?.[1]?.revenueEffectiveFrom ?? eventSave?.[0]?.revenueEffectiveFrom).toBe(
			'2026-09-01',
		);
	});

	it('notifies once after transferring many releases', async () => {
		manager.findOne.mockResolvedValue(makeRelease());
		manager.createQueryBuilder().getMany.mockResolvedValue([makeOpenPeriod()]);

		await service.transferMany(manager as never, {
			items: [
				{ releaseId: RELEASE_ID, labelId: 'LBL1' },
			],
			tenantId: TENANT_B,
			effectiveDate: '2026-10-01',
			revenueEffectiveFrom: '2026-10-01',
			source: 'asset_import',
			actorId: ACTOR,
			notify: true,
		});

		const notifyCalls = manager.query.mock.calls.filter((call) =>
			String(call[0]).includes('pg_notify'),
		);
		expect(notifyCalls).toHaveLength(1);
	});
});
