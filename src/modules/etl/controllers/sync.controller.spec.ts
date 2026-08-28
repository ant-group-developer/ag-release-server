import { Test } from '@nestjs/testing';
import { ClickHouseMigrationService } from '../../clickhouse';
import { FtpService } from '../services/ftp/ftp.service';
import { ImportJobsService } from '../services/import-jobs/import-jobs.service';
import { FtpSyncQueueService } from '../services/sync/ftp-sync-queue.service';
import { FtpSyncWorkerService } from '../services/sync/ftp-sync-worker.service';
import { SyncService } from '../services/sync/sync.service';

/**
 * A range sync touches many DSP folders and some of them are routinely broken
 * upstream. Failing the whole job over that hid the 400k rows that did import,
 * so folder-level problems are warnings carried in the result while the job
 * itself completes. Only a fatal error still marks the job failed.
 */
describe('FtpSyncWorkerService range job outcome', () => {
	let worker: FtpSyncWorkerService;

	const syncService = { syncPeriod: jest.fn() };
	const ftpService = {
		withSession: jest.fn(async (action: (session: object) => Promise<void>) =>
			action({}),
		),
	};
	const importJobsService = {
		markProcessing: jest.fn(),
		markCompleted: jest.fn(),
		markFailed: jest.fn(),
		updateProgress: jest.fn(),
	};

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
			providers: [
				FtpSyncWorkerService,
				{ provide: SyncService, useValue: syncService },
				{ provide: FtpService, useValue: ftpService },
				{ provide: ImportJobsService, useValue: importJobsService },
				{ provide: FtpSyncQueueService, useValue: {} },
				{ provide: ClickHouseMigrationService, useValue: {} },
			],
		}).compile();

		worker = moduleRef.get(FtpSyncWorkerService);
		jest.clearAllMocks();
	});

	const runRange = (periods: string[]) =>
		worker.executeSyncRangeJob('job-1', periods, false, undefined);

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
