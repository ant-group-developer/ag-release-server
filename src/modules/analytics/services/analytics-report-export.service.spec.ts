import { AnalyticsReportExportService } from './analytics-report-export.service';

describe('AnalyticsReportExportService.createExportJob', () => {
	it('persists statement mode and returns the matching SSE endpoint', async () => {
		const importJobsService = {
			create: jest.fn().mockResolvedValue({ id: 'job-statement' }),
			markQueued: jest.fn().mockResolvedValue(undefined),
		};
		const exportQueueService = {
			enqueue: jest.fn().mockResolvedValue(undefined),
		};
		const service = new AnalyticsReportExportService(
			{} as never,
			{} as never,
			importJobsService as never,
			exportQueueService as never,
			{} as never,
			{} as never,
		);
		const dto = {
			fromDate: '2026-01',
			endDate: '2026-01',
			exportMode: 'statement' as const,
		};

		await expect(
			service.createExportJob('tenant-a', 'user-1', dto),
		).resolves.toMatchObject({
			jobId: 'job-statement',
			eventsUrl:
				'/analytics/reports/statement-export/job-statement/events',
		});

		expect(importJobsService.create).toHaveBeenCalledWith(
			expect.objectContaining({
				params: expect.objectContaining({ exportMode: 'statement' }),
				fileName: expect.stringContaining('_statement-report_'),
			}),
		);
		expect(importJobsService.markQueued).toHaveBeenCalledWith(
			'job-statement',
		);
		expect(exportQueueService.enqueue).toHaveBeenCalledWith(
			'job-statement',
		);
	});
});

describe('AnalyticsReportExportService.reapStuckQueuedJobs', () => {
	const originalRole = process.env.APP_ROLE;

	afterEach(() => {
		if (originalRole === undefined) delete process.env.APP_ROLE;
		else process.env.APP_ROLE = originalRole;
	});

	function createService() {
		const clickHouseService = { query: jest.fn() };
		const importJobsService = { markFailed: jest.fn() };
		const exportQueueService = {
			isTracked: jest.fn(),
			incrementRequeueAttempt: jest.fn(),
			clearRequeueAttempts: jest.fn(),
			enqueue: jest.fn(),
		};

		const service = new AnalyticsReportExportService(
			clickHouseService as never,
			{} as never,
			importJobsService as never,
			exportQueueService as never,
			{} as never,
			{} as never,
		);

		return {
			clickHouseService,
			exportQueueService,
			importJobsService,
			service,
		};
	}

	it('does not run in an API process', async () => {
		process.env.APP_ROLE = 'api';
		const { clickHouseService, service } = createService();

		await service.reapStuckQueuedJobs();

		expect(clickHouseService.query).not.toHaveBeenCalled();
	});

	it('re-enqueues an orphaned queued export job', async () => {
		process.env.APP_ROLE = 'worker';
		const { clickHouseService, exportQueueService, service } =
			createService();
		clickHouseService.query.mockResolvedValue([{ id: 'orphan-job' }]);
		exportQueueService.isTracked.mockResolvedValue(false);
		exportQueueService.incrementRequeueAttempt.mockResolvedValue(1);

		await service.reapStuckQueuedJobs();

		expect(exportQueueService.enqueue).toHaveBeenCalledWith('orphan-job');
		expect(exportQueueService.clearRequeueAttempts).not.toHaveBeenCalled();
	});

	it('fails an orphan after the retry limit', async () => {
		process.env.APP_ROLE = 'worker';
		const {
			clickHouseService,
			exportQueueService,
			importJobsService,
			service,
		} = createService();
		clickHouseService.query.mockResolvedValue([{ id: 'exhausted-job' }]);
		exportQueueService.isTracked.mockResolvedValue(false);
		exportQueueService.incrementRequeueAttempt.mockResolvedValue(4);
		importJobsService.markFailed.mockResolvedValue(undefined);

		await service.reapStuckQueuedJobs();

		expect(importJobsService.markFailed).toHaveBeenCalledWith(
			'exhausted-job',
			'Stuck in QUEUED, re-enqueued 3 time(s) without progress',
		);
		expect(exportQueueService.clearRequeueAttempts).toHaveBeenCalledWith(
			'exhausted-job',
		);
		expect(exportQueueService.enqueue).not.toHaveBeenCalled();
	});

	it('does not touch a queued job still tracked by Redis', async () => {
		process.env.APP_ROLE = 'worker';
		const { clickHouseService, exportQueueService, service } =
			createService();
		clickHouseService.query.mockResolvedValue([{ id: 'queued-job' }]);
		exportQueueService.isTracked.mockResolvedValue(true);

		await service.reapStuckQueuedJobs();

		expect(
			exportQueueService.incrementRequeueAttempt,
		).not.toHaveBeenCalled();
		expect(exportQueueService.enqueue).not.toHaveBeenCalled();
	});

	it('fails an export job still pending after one hour', async () => {
		process.env.APP_ROLE = 'worker';
		const { clickHouseService, importJobsService, service } =
			createService();
		clickHouseService.query.mockResolvedValue([
			{ id: 'stale-pending-job' },
		]);
		importJobsService.markFailed.mockResolvedValue(undefined);

		await service.failStuckPendingExportJobs();

		expect(importJobsService.markFailed).toHaveBeenCalledWith(
			'stale-pending-job',
			'Export job remained PENDING for over 60 minutes',
		);
		expect(clickHouseService.query.mock.calls[0][1]).toMatchObject({
			minutes: 60,
		});
	});
});
