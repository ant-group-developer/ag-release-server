import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { BucketR2Service } from '../../../bucket2/services/bucket-r2.service';
import {
	ClickHouseMigrationService,
	ClickHouseService,
} from '../../../clickhouse';
import { FtpParserConfigService } from '../../../dsp-report/services/ftp-parser-config.service';
import { FtpReportFileRuleService } from '../../../dsp-report/services/ftp-report-file-rule.service';
import { FtpReportFileDiscoveryService } from './ftp-report-file-discovery.service';
import { FtpService } from './ftp.service';

describe('FtpReportFileDiscoveryService sample worker', () => {
	let service: FtpReportFileDiscoveryService;
	let originalAppRole: string | undefined;
	let session: { close: jest.Mock };

	const ftpService = {
		createSession: jest.fn(),
		downloadDiscoverySampleFile: jest.fn(),
	};
	const ruleService = {};
	const parserConfigService = {};
	const clickHouseService = { query: jest.fn(), insert: jest.fn() };
	const migrationService = { waitForMigrations: jest.fn() };
	const schedulerRegistry = {
		getCronJobs: jest.fn(),
		addCronJob: jest.fn(),
		deleteCronJob: jest.fn(),
	};
	const bucketR2Service = { uploadFileFromPath: jest.fn() };

	const SAMPLE_TASK = {
		id: 'task-1',
		source_category: 'trends',
		period: '202401',
		dsp_folder: 'dsp-a',
		ftp_path: 'report.tsv',
		attempt: 0,
		status: 'pending',
	};

	beforeEach(async () => {
		originalAppRole = process.env.APP_ROLE;
		process.env.APP_ROLE = 'worker';

		const moduleRef = await Test.createTestingModule({
			providers: [
				FtpReportFileDiscoveryService,
				{ provide: FtpService, useValue: ftpService },
				{ provide: FtpReportFileRuleService, useValue: ruleService },
				{
					provide: FtpParserConfigService,
					useValue: parserConfigService,
				},
				{ provide: ClickHouseService, useValue: clickHouseService },
				{
					provide: ClickHouseMigrationService,
					useValue: migrationService,
				},
				{ provide: SchedulerRegistry, useValue: schedulerRegistry },
				{ provide: BucketR2Service, useValue: bucketR2Service },
			],
		}).compile();

		service = moduleRef.get(FtpReportFileDiscoveryService);
		jest.clearAllMocks();
		session = { close: jest.fn() };
		ftpService.createSession.mockReturnValue(session);
	});

	afterEach(() => {
		if (originalAppRole === undefined) delete process.env.APP_ROLE;
		else process.env.APP_ROLE = originalAppRole;
	});

	/** First query call is getConfig, second is the task batch. */
	const givenConfigAndTasks = (config: any, tasks: any[]) => {
		clickHouseService.query
			.mockResolvedValueOnce([config])
			.mockResolvedValueOnce(tasks);
	};

	const runWorker = () => (service as any).processSampleTasks();

	it('does not open an FTP session when there is nothing to download', async () => {
		givenConfigAndTasks({}, []);

		await runWorker();

		expect(ftpService.createSession).not.toHaveBeenCalled();
		expect(ftpService.downloadDiscoverySampleFile).not.toHaveBeenCalled();
	});

	it('runs alongside other FTP work instead of waiting on a shared lock', async () => {
		// The sample worker no longer takes a cross-process mutex: concurrency is
		// bounded by the per-process FTP connection limiter, so a sync running
		// elsewhere must not stop this batch from downloading.
		givenConfigAndTasks({}, [SAMPLE_TASK]);
		clickHouseService.insert.mockResolvedValue(undefined);
		ftpService.downloadDiscoverySampleFile.mockResolvedValue(undefined);
		bucketR2Service.uploadFileFromPath.mockResolvedValue(undefined);

		await runWorker();

		expect(ftpService.downloadDiscoverySampleFile).toHaveBeenCalledTimes(1);
	});

	it('closes the session after a download failure is recorded', async () => {
		givenConfigAndTasks({}, [SAMPLE_TASK]);
		clickHouseService.insert.mockResolvedValue(undefined);
		ftpService.downloadDiscoverySampleFile.mockRejectedValue(
			new Error('530 Login incorrect.'),
		);

		await runWorker();

		// The task is marked failed rather than rethrown, and the connection slot
		// goes back so the next sync is not blocked behind a dead sample download.
		const statuses = clickHouseService.insert.mock.calls.map(
			(call) => call[1][0].status,
		);
		expect(statuses).toContain('failed');
		expect(session.close).toHaveBeenCalledTimes(1);
	});

	it('downloads a batch sequentially over one FTP session', async () => {
		const secondTask = { ...SAMPLE_TASK, id: 'task-2' };
		givenConfigAndTasks({}, [SAMPLE_TASK, secondTask]);
		clickHouseService.insert.mockResolvedValue(undefined);
		ftpService.downloadDiscoverySampleFile.mockResolvedValue(undefined);
		bucketR2Service.uploadFileFromPath.mockResolvedValue(undefined);

		await runWorker();

		expect(ftpService.downloadDiscoverySampleFile).toHaveBeenCalledTimes(2);
		for (const call of ftpService.downloadDiscoverySampleFile.mock.calls) {
			expect(call[5]).toBe(session);
		}
		expect(session.close).toHaveBeenCalledTimes(1);
	});

	it('closes the session even when bookkeeping itself throws', async () => {
		givenConfigAndTasks({}, [SAMPLE_TASK]);
		clickHouseService.insert.mockRejectedValue(
			new Error('clickhouse down'),
		);

		await expect(runWorker()).rejects.toThrow('clickhouse down');

		expect(session.close).toHaveBeenCalledTimes(1);
	});

	it('holds failed tasks back for the configured backoff', async () => {
		givenConfigAndTasks(
			{
				sample_worker_max_attempts: 5,
				sample_worker_retry_backoff_ms: 120_000,
				sample_worker_batch_size: 3,
			},
			[],
		);

		await runWorker();

		const [sql, params] = clickHouseService.query.mock.calls[1];
		expect(sql).toContain("status IN ('pending','failed')");
		expect(sql).toContain('attempt < {maxAttempts:UInt8}');
		expect(sql).toContain(
			"status = 'pending' OR updated_at <= now() - INTERVAL {backoffSeconds:UInt32} SECOND",
		);
		expect(params).toEqual({
			maxAttempts: 5,
			backoffSeconds: 120,
			batchSize: 3,
		});
	});

	it('falls back to safe defaults when the config row predates the columns', async () => {
		givenConfigAndTasks({}, []);

		await runWorker();

		expect(clickHouseService.query.mock.calls[1][1]).toEqual({
			maxAttempts: 3,
			backoffSeconds: 60,
			batchSize: 2,
		});
	});

	it('stays idle outside the worker role', async () => {
		process.env.APP_ROLE = 'api';

		await runWorker();

		expect(clickHouseService.query).not.toHaveBeenCalled();
		expect(ftpService.createSession).not.toHaveBeenCalled();
	});
});
