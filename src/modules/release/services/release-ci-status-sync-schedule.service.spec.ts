import { BadRequestException } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Repository } from 'typeorm';
import { ReleaseCiStatusSyncSchedule } from '../entities/release-ci-status-sync-schedule.entity';
import { Release } from '../entities/release.entity';
import { ReleaseStatus } from '../enum/release.enum';
import { ReleaseCiStatusSyncScheduleService } from './release-ci-status-sync-schedule.service';
import { ReleaseDspDeliveryService } from './release-dsp-services/release-dsp-delivery.service';

jest.mock('./release-dsp-services/release-dsp-delivery.service', () => ({
	ReleaseDspDeliveryService: class ReleaseDspDeliveryService {},
}));

describe('ReleaseCiStatusSyncScheduleService', () => {
	const scheduleId = '11111111-1111-4111-8111-111111111111';
	let originalAppRole: string | undefined;
	let scheduleRepo: jest.Mocked<Repository<ReleaseCiStatusSyncSchedule>>;
	let releaseRepo: jest.Mocked<Repository<Release>>;
	let schedulerRegistry: jest.Mocked<SchedulerRegistry>;
	let releaseDspDeliveryService: jest.Mocked<ReleaseDspDeliveryService>;
	let service: ReleaseCiStatusSyncScheduleService;

	const createSchedule = (
		overrides: Partial<ReleaseCiStatusSyncSchedule> = {},
	): ReleaseCiStatusSyncSchedule => ({
		id: scheduleId,
		createdAt: new Date('2026-08-14T00:00:00.000Z'),
		updatedAt: new Date('2026-08-14T00:00:00.000Z'),
		name: 'Daily CI release status sync',
		syncStatusEnabled: true,
		cronExpression: '0 6 * * *',
		timezone: 'Asia/Ho_Chi_Minh',
		releaseStatuses: [ReleaseStatus.SUBMITTED],
		batchSize: 2,
		concurrency: 2,
		isRunning: false,
		runningSince: null,
		runningBy: null,
		restartRequestedAt: null,
		lastRunAt: null,
		lastFinishedAt: null,
		...overrides,
	});

	beforeEach(() => {
		originalAppRole = process.env.APP_ROLE;
		process.env.APP_ROLE = 'api';

		scheduleRepo = {
			find: jest.fn(),
			findOne: jest.fn(),
			save: jest.fn(),
			query: jest.fn(),
			update: jest.fn(),
		} as unknown as jest.Mocked<Repository<ReleaseCiStatusSyncSchedule>>;

		releaseRepo = {
			createQueryBuilder: jest.fn(),
		} as unknown as jest.Mocked<Repository<Release>>;

		schedulerRegistry = {
			getCronJobs: jest.fn().mockReturnValue(new Map()),
			addCronJob: jest.fn(),
			deleteCronJob: jest.fn(),
		} as unknown as jest.Mocked<SchedulerRegistry>;

		releaseDspDeliveryService = {
			syncStatusFromCi: jest.fn(),
		} as unknown as jest.Mocked<ReleaseDspDeliveryService>;

		service = new ReleaseCiStatusSyncScheduleService(
			scheduleRepo,
			releaseRepo,
			schedulerRegistry,
			releaseDspDeliveryService,
		);
	});

	afterEach(() => {
		if (originalAppRole === undefined) {
			delete process.env.APP_ROLE;
		} else {
			process.env.APP_ROLE = originalAppRole;
		}
		jest.restoreAllMocks();
	});

	it('rejects an invalid cron expression before saving config', async () => {
		scheduleRepo.find.mockResolvedValue([createSchedule()]);

		await expect(
			service.updateConfig({ cronExpression: 'invalid cron' }),
		).rejects.toBeInstanceOf(BadRequestException);
		expect(scheduleRepo.save.mock.calls).toHaveLength(0);
	});

	it('requests a restart when a manual run cannot claim an active lock', async () => {
		const runningSince = new Date('2026-08-14T01:00:00.000Z');
		const schedule = createSchedule({ isRunning: true, runningSince });
		scheduleRepo.find.mockResolvedValue([schedule]);
		scheduleRepo.query.mockResolvedValueOnce([]);
		scheduleRepo.update.mockResolvedValue({
			generatedMaps: [],
			raw: [],
			affected: 1,
		});

		const result = await service.runNow();

		expect(result).toMatchObject({
			scheduleId,
			restartRequested: true,
			runningSince,
		});
		expect(scheduleRepo.update.mock.calls).toHaveLength(1);
		expect(
			releaseDspDeliveryService.syncStatusFromCi.mock.calls,
		).toHaveLength(0);
	});

	it('returns bad request when a manual run is disabled', async () => {
		const schedule = createSchedule({ syncStatusEnabled: false });
		scheduleRepo.find.mockResolvedValue([schedule]);
		scheduleRepo.query.mockResolvedValueOnce([]);

		await expect(service.runNow()).rejects.toBeInstanceOf(
			BadRequestException,
		);
		expect(
			releaseDspDeliveryService.syncStatusFromCi.mock.calls,
		).toHaveLength(0);
	});

	it('processes all batches and continues when one release fails', async () => {
		const schedule = createSchedule();
		const releaseIds = [
			'10000000-0000-4000-8000-000000000001',
			'10000000-0000-4000-8000-000000000002',
			'10000000-0000-4000-8000-000000000003',
		];

		scheduleRepo.find.mockResolvedValue([schedule]);
		scheduleRepo.findOne.mockResolvedValue(schedule);
		scheduleRepo.query
			.mockResolvedValueOnce([
				[
					{
						id: schedule.id,
						releaseStatuses: schedule.releaseStatuses,
						batchSize: schedule.batchSize,
						concurrency: schedule.concurrency,
						runningSince: new Date(),
					},
				],
				1,
			])
			.mockResolvedValueOnce([]);

		const getRawMany = jest
			.fn()
			.mockResolvedValueOnce(releaseIds.slice(0, 2).map((id) => ({ id })))
			.mockResolvedValueOnce(releaseIds.slice(2).map((id) => ({ id })))
			.mockResolvedValueOnce([]);
		const queryBuilder = {
			select: jest.fn().mockReturnThis(),
			where: jest.fn().mockReturnThis(),
			andWhere: jest.fn().mockReturnThis(),
			orderBy: jest.fn().mockReturnThis(),
			limit: jest.fn().mockReturnThis(),
			getRawMany,
		};
		releaseRepo.createQueryBuilder.mockReturnValue(queryBuilder as never);

		releaseDspDeliveryService.syncStatusFromCi
			.mockResolvedValueOnce({
				releaseId: releaseIds[0],
				releaseStatus: ReleaseStatus.PROCESSING,
				applied: 1,
				skipped: 0,
				skippedItems: [],
				ciStatuses: [],
			})
			.mockRejectedValueOnce(new Error('CI timeout'))
			.mockResolvedValueOnce({
				releaseId: releaseIds[2],
				releaseStatus: ReleaseStatus.DISTRIBUTED,
				applied: 2,
				skipped: 0,
				skippedItems: [],
				ciStatuses: [],
			});

		const summary = await service.runNow();

		expect(summary).toMatchObject({
			total: 3,
			succeeded: 2,
			failed: 1,
			stoppedBecauseDisabled: false,
		});
		expect(
			releaseDspDeliveryService.syncStatusFromCi.mock.calls,
		).toHaveLength(3);
		expect(getRawMany).toHaveBeenCalledTimes(3);
		expect(queryBuilder.andWhere).toHaveBeenCalledWith(
			'release.type = :releaseType',
			{ releaseType: 'audio' },
		);
		expect(scheduleRepo.query.mock.calls).toHaveLength(2);
	});
});
