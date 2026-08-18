import { ReleaseStatus } from '../enum/release.enum';
import { ReleaseCiStatusSyncScheduleService } from '../services/release-ci-status-sync-schedule.service';
import { ReleaseCiStatusSyncScheduleController } from './release-ci-status-sync-schedule.controller';

jest.mock('../services/release-ci-status-sync-schedule.service', () => ({
	ReleaseCiStatusSyncScheduleService: class ReleaseCiStatusSyncScheduleService {},
}));

describe('ReleaseCiStatusSyncScheduleController', () => {
	let scheduleService: jest.Mocked<ReleaseCiStatusSyncScheduleService>;
	let controller: ReleaseCiStatusSyncScheduleController;

	beforeEach(() => {
		scheduleService = {
			getConfig: jest.fn(),
			updateConfig: jest.fn(),
			runNow: jest.fn(),
		} as unknown as jest.Mocked<ReleaseCiStatusSyncScheduleService>;
		controller = new ReleaseCiStatusSyncScheduleController(scheduleService);
	});

	it('gets the current schedule config', async () => {
		const schedule = { id: 'schedule-id' };
		scheduleService.getConfig.mockResolvedValue(schedule as never);

		await controller.getSchedule();

		expect(scheduleService.getConfig.mock.calls).toHaveLength(1);
	});

	it('updates schedule config', async () => {
		const dto = {
			syncStatusEnabled: true,
			releaseStatuses: [ReleaseStatus.SUBMITTED],
		};
		scheduleService.updateConfig.mockResolvedValue({} as never);

		await controller.updateSchedule(dto);

		expect(scheduleService.updateConfig.mock.calls).toEqual([[dto]]);
	});

	it('runs status synchronization immediately', async () => {
		scheduleService.runNow.mockResolvedValue({
			scheduleId: 'schedule-id',
			trigger: 'manual',
			total: 1,
			succeeded: 1,
			failed: 0,
			durationMs: 10,
			stoppedBecauseDisabled: false,
		});

		const result = controller.runNow();

		expect(scheduleService.runNow.mock.calls).toHaveLength(1);
		expect(result).toMatchObject({
			message: 'Thành công, tiến trình đang đồng bộ',
		});
	});
});
