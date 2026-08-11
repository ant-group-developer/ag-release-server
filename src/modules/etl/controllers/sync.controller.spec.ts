import { Test } from '@nestjs/testing';
import { FtpService } from '../services/ftp/ftp.service';
import { ImportJobsService } from '../services/import-jobs/import-jobs.service';
import { SchedulerService } from '../services/scheduler/scheduler.service';
import { SyncService } from '../services/sync/sync.service';
import { SyncController } from './sync.controller';

/**
 * A range sync touches many DSP folders and some of them are routinely broken
 * upstream. Failing the whole job over that hid the 400k rows that did import,
 * so folder-level problems are warnings carried in the result while the job
 * itself completes. Only a fatal error still marks the job failed.
 */
describe('SyncController range job outcome', () => {
	let controller: SyncController;

	const syncService = { syncPeriod: jest.fn() };
	const ftpService = { withSession: jest.fn() };
	const importJobsService = {
		create: jest.fn(),
		markProcessing: jest.fn(),
		markCompleted: jest.fn(),
		markFailed: jest.fn(),
		updateProgress: jest.fn(),
	};
	const schedulerService = { rescheduleAutoSync: jest.fn() };

	const periodResult = (overrides: Record<string, any> = {}) => ({
		totalRows: 0,
		categories: [],
		releases: {
			total: 0,
			imported: 0,
			skipped: 0,
			errors: 0,
			inDb: 0,
			pending: 0,
		},
		...overrides,
	});

	const folderCategory = (statuses: string[]) => ({
		folders: statuses.map((status, index) => ({
			dspFolder: `dsp-${index}`,
			status,
		})),
	});

	beforeEach(async () => {
		const moduleRef = await Test.createTestingModule({
			controllers: [SyncController],
			providers: [
				{ provide: SyncService, useValue: syncService },
				{ provide: FtpService, useValue: ftpService },
				{ provide: ImportJobsService, useValue: importJobsService },
				{ provide: SchedulerService, useValue: schedulerService },
			],
		}).compile();

		controller = moduleRef.get(SyncController);
		jest.clearAllMocks();
	});

	const runRange = (periods: string[]) =>
		(controller as any).executeSyncRangeJob(
			'job-1',
			periods,
			false,
			undefined,
			{},
		);

	it('completes with warnings when some folders fail', async () => {
		syncService.syncPeriod
			.mockResolvedValueOnce(
				periodResult({
					totalRows: 400_000,
					categories: [folderCategory(['success', 'error'])],
				}),
			)
			.mockResolvedValueOnce(
				periodResult({
					totalRows: 8_057,
					categories: [folderCategory(['error'])],
				}),
			);

		await runRange(['202401', '202402']);

		expect(importJobsService.markFailed).not.toHaveBeenCalled();
		const [jobId, summary] = importJobsService.markCompleted.mock.calls[0];
		expect(jobId).toBe('job-1');
		expect(summary.hasWarnings).toBe(true);
		expect(summary.totalFolderErrors).toBe(2);
		expect(summary.totalRows).toBe(408_057);
		// The per-folder detail survives in the result so the failures are still
		// diagnosable even though the job reads as a success.
		expect(summary.results).toHaveLength(2);
	});

	it('counts a period that throws as a warning rather than a failure', async () => {
		syncService.syncPeriod
			.mockResolvedValueOnce(periodResult({ totalRows: 10 }))
			.mockRejectedValueOnce(new Error('550 folder missing'));

		await runRange(['202401', '202402']);

		expect(importJobsService.markFailed).not.toHaveBeenCalled();
		const [, summary] = importJobsService.markCompleted.mock.calls[0];
		expect(summary.totalFolderErrors).toBe(1);
		expect(summary.results[1]).toEqual({
			period: '202402',
			error: '550 folder missing',
		});
	});

	it('completes without warnings when every folder succeeds', async () => {
		syncService.syncPeriod.mockResolvedValue(
			periodResult({
				totalRows: 5,
				categories: [folderCategory(['success'])],
			}),
		);

		await runRange(['202401']);

		const [, summary] = importJobsService.markCompleted.mock.calls[0];
		expect(summary.hasWarnings).toBe(false);
		expect(summary.totalFolderErrors).toBe(0);
	});

	it('still fails the job on a fatal error outside the per-period catch', async () => {
		syncService.syncPeriod.mockResolvedValue(periodResult());
		importJobsService.markCompleted.mockRejectedValueOnce(
			new Error('clickhouse down'),
		);

		await runRange(['202401']);

		expect(importJobsService.markFailed).toHaveBeenCalledTimes(1);
		expect(importJobsService.markFailed.mock.calls[0][0]).toBe('job-1');
	});
});
