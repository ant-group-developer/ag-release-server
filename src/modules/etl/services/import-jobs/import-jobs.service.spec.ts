import {
	ImportJobReportSource,
	ImportJobSourceType,
	ImportJobStatus,
} from '../../interfaces';
import { ImportJobsService } from './import-jobs.service';

describe('ImportJobsService ordered persistence', () => {
	function setup() {
		const db = {
			insert: jest.fn().mockResolvedValue(undefined),
			query: jest.fn(),
		};
		const events = { emit: jest.fn() };
		const service = new ImportJobsService(
			db as never,
			events as never,
			{} as never,
		);
		return { db, events, service };
	}

	it('can mark a job failed after its completion write fails without emitting completed', async () => {
		const { db, events, service } = setup();
		const job = await service.create({
			sourceType: ImportJobSourceType.ANALYTICS_REPORT_EXPORT,
		});
		await service.markProcessing(job.id);
		const processingRow = db.insert.mock.calls[1][1][0];
		db.query.mockResolvedValue([processingRow]);
		db.insert.mockRejectedValueOnce(new Error('completion insert failed'));
		events.emit.mockClear();
		await expect(
			service.markCompleted(job.id, { totalRows: 7 }),
		).rejects.toThrow('completion insert failed');
		expect(events.emit).not.toHaveBeenCalled();
		await service.markFailed(job.id, 'completion insert failed');
		expect(events.emit.mock.calls[0][0].type).toBe('failed');
	});

	it('waits for earlier writes and emits the persisted snapshot with unique versions', async () => {
		const { db, events, service } = setup();
		const now = jest.spyOn(Date, 'now').mockReturnValue(Date.now());
		try {
			const job = await service.create({
				sourceType: ImportJobSourceType.ANALYTICS_REPORT_EXPORT,
				progressTotal: 5,
			});
			await service.markProcessing(job.id);
			events.emit.mockClear();
			let releaseProgress!: () => void;
			let releaseCompleted!: () => void;
			db.insert
				.mockImplementationOnce(
					() =>
						new Promise<void>((resolve) => {
							releaseProgress = resolve;
						}),
				)
				.mockImplementationOnce(
					() =>
						new Promise<void>((resolve) => {
							releaseCompleted = resolve;
						}),
				);
			const progress = service.updateProgress(
				job.id,
				{ processedRows: 7 },
				true,
			);
			await new Promise<void>((resolve) => setImmediate(resolve));
			const completed = service.markCompleted(job.id, { totalRows: 7 });
			await new Promise<void>((resolve) => setImmediate(resolve));
			expect(db.insert).toHaveBeenCalledTimes(3);
			expect(events.emit).not.toHaveBeenCalled();
			releaseProgress();
			await progress;
			await new Promise<void>((resolve) => setImmediate(resolve));
			expect(events.emit.mock.calls[0][0]).toMatchObject({
				type: 'progress',
				data: { status: ImportJobStatus.PROCESSING, result: null },
			});
			expect(events.emit).toHaveBeenCalledTimes(1);
			releaseCompleted();
			await completed;
			expect(events.emit.mock.calls[1][0].type).toBe('completed');
			const versions = db.insert.mock.calls.map(
				([, rows]) => rows[0].updated_at,
			);
			for (let i = 1; i < versions.length; i++)
				expect(versions[i] > versions[i - 1]).toBe(true);
		} finally {
			now.mockRestore();
		}
	});

	it.each([
		ImportJobStatus.COMPLETED,
		ImportJobStatus.FAILED,
		ImportJobStatus.CANCELLED,
	])('does not reopen a %s job or accept late progress', async (status) => {
		const { db, service } = setup();
		const job = await service.create({
			sourceType: ImportJobSourceType.ANALYTICS_REPORT_EXPORT,
		});
		job.status = status;
		db.insert.mockClear();
		await service.markProcessing(job.id);
		await service.markQueued(job.id);
		await service.updateProgress(job.id, { processedRows: 99 }, true);
		expect(db.insert).not.toHaveBeenCalled();
		expect(job.status).toBe(status);
	});
});

describe('ImportJobsService.list reportSource filter', () => {
	function createService() {
		const clickHouseService = { query: jest.fn() };
		const service = new ImportJobsService(
			clickHouseService as never,
			{ emit: jest.fn() } as never,
			{} as never,
		);
		return { clickHouseService, service };
	}

	it('filters Spotify REPORT_UPLOAD jobs by active configured file patterns', async () => {
		const { clickHouseService, service } = createService();
		clickHouseService.query
			.mockResolvedValueOnce([
				{ file_patterns: ['spotify-track-for-.*\\.txt$'] },
			])
			.mockResolvedValueOnce([{ total: '0' }]);

		await service.list({ reportSource: ImportJobReportSource.SPOTIFY });

		expect(clickHouseService.query).toHaveBeenCalledTimes(2);
		expect(clickHouseService.query.mock.calls[0][1]).toEqual({
			sourceCode: 'spotify',
		});
		const [countSql, params] = clickHouseService.query.mock.calls[1];
		expect(countSql).toContain(
			'source_type = {reportUploadSourceType:String}',
		);
		expect(countSql).toContain('arrayExists(pattern -> match(file_name');
		expect(params).toMatchObject({
			reportUploadSourceType: ImportJobSourceType.REPORT_UPLOAD,
			reportSourcePatterns: ['spotify-track-for-.*\\.txt$'],
		});
	});

	it('groups only the expected FTP job types for Merlin', async () => {
		const { clickHouseService, service } = createService();
		clickHouseService.query.mockResolvedValueOnce([{ total: '0' }]);

		await service.list({ reportSource: ImportJobReportSource.MERLIN });

		expect(clickHouseService.query).toHaveBeenCalledTimes(1);
		const [countSql, params] = clickHouseService.query.mock.calls[0];
		expect(countSql).toContain(
			'source_type IN ({merlinSourceTypes:Array(String)})',
		);
		expect(params.merlinSourceTypes).toEqual([
			ImportJobSourceType.FTP_SYNC_PERIOD,
			ImportJobSourceType.FTP_SYNC_ALL,
			ImportJobSourceType.FTP_RETRY,
			ImportJobSourceType.FTP_AUTO_CRON,
		]);
	});

	it('returns no Warner jobs when no active Warner pattern is configured', async () => {
		const { clickHouseService, service } = createService();
		clickHouseService.query
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([{ total: '0' }]);

		await service.list({ reportSource: ImportJobReportSource.WARNER });

		const [countSql] = clickHouseService.query.mock.calls[1];
		expect(countSql).toMatch(/\b0\b/);
	});

	it('hides analytics report exports from the default ETL job list', async () => {
		const { clickHouseService, service } = createService();
		clickHouseService.query.mockResolvedValueOnce([{ total: '0' }]);

		await service.list();

		const [countSql, params] = clickHouseService.query.mock.calls[0];
		expect(countSql).toContain(
			'source_type != {analyticsExportExcludedSourceType:String}',
		);
		expect(params.analyticsExportExcludedSourceType).toBe(
			ImportJobSourceType.ANALYTICS_REPORT_EXPORT,
		);
	});

	it('does not exclude analytics exports when sourceType is set explicitly', async () => {
		const { clickHouseService, service } = createService();
		clickHouseService.query.mockResolvedValueOnce([{ total: '0' }]);

		await service.list({
			sourceType: ImportJobSourceType.ANALYTICS_REPORT_EXPORT,
		});

		const [countSql, params] = clickHouseService.query.mock.calls[0];
		expect(countSql).toContain('source_type = {sourceType:String}');
		expect(countSql).not.toContain(
			'source_type != {analyticsExportExcludedSourceType:String}',
		);
		expect(params.sourceType).toBe(
			ImportJobSourceType.ANALYTICS_REPORT_EXPORT,
		);
	});

	it('leaves analytics export PENDING jobs to the dedicated one-hour timeout', async () => {
		const originalRole = process.env.APP_ROLE;
		process.env.APP_ROLE = 'worker';
		const { clickHouseService, service } = createService();
		clickHouseService.query.mockResolvedValue([]);

		try {
			await service.checkPendingTimeout();
		} finally {
			if (originalRole === undefined) delete process.env.APP_ROLE;
			else process.env.APP_ROLE = originalRole;
		}

		const [sql, params] = clickHouseService.query.mock.calls[0];
		expect(sql).toContain(
			'source_type != {analyticsExportSourceType:String}',
		);
		expect(params.analyticsExportSourceType).toBe(
			ImportJobSourceType.ANALYTICS_REPORT_EXPORT,
		);
	});
});
