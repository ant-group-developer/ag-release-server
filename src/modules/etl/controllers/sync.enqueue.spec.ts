import { Test } from '@nestjs/testing';
import { FtpService } from '../services/ftp/ftp.service';
import { ImportJobsService } from '../services/import-jobs/import-jobs.service';
import { SchedulerService } from '../services/scheduler/scheduler.service';
import { FtpSyncQueueService } from '../services/sync/ftp-sync-queue.service';
import { SyncService } from '../services/sync/sync.service';
import { SyncController } from './sync.controller';

describe('SyncController FTP enqueue', () => {
	let controller: SyncController;
	const importJobsService = {
		create: jest.fn(),
		markQueued: jest.fn(),
		markFailed: jest.fn(),
	};
	const ftpSyncQueueService = { pushJob: jest.fn() };

	beforeEach(async () => {
		const moduleRef = await Test.createTestingModule({
			controllers: [SyncController],
			providers: [
				{ provide: SyncService, useValue: {} },
				{ provide: FtpService, useValue: {} },
				{ provide: ImportJobsService, useValue: importJobsService },
				{ provide: SchedulerService, useValue: {} },
				{ provide: FtpSyncQueueService, useValue: ftpSyncQueueService },
			],
		}).compile();
		controller = moduleRef.get(SyncController);
		jest.clearAllMocks();
		importJobsService.create.mockResolvedValue({ id: 'job-ftp' });
		ftpSyncQueueService.pushJob.mockResolvedValue(undefined);
		importJobsService.markQueued.mockResolvedValue({});
	});

	it('enqueues a range sync instead of running it on the API process', async () => {
		await controller.syncPeriod(
			{
				month_start: '202608',
				month_end: '202608',
				force: true,
				categories: ['trends'],
			},
			{ tenantId: 't1', sub: 'u1' },
		);

		expect(ftpSyncQueueService.pushJob).toHaveBeenCalledWith('job-ftp');
		expect(importJobsService.markQueued).toHaveBeenCalledWith('job-ftp');
	});

	it('enqueues a retry instead of running it on the API process', async () => {
		await controller.retryImport(
			{ period: '202608', categories: ['trends'] },
			{ tenantId: 't1', sub: 'u1' },
		);

		expect(ftpSyncQueueService.pushJob).toHaveBeenCalledWith('job-ftp');
		expect(importJobsService.markQueued).toHaveBeenCalledWith('job-ftp');
	});
});
