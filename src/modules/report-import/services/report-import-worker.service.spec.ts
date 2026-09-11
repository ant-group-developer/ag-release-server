import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import { FactSalesRow } from '../../etl/interfaces';
import {
	formatReportDecimal,
	reportDecimalUnits,
} from '../../etl/parsers/sales/configured-report-sales.parser';
import { TwentyTwoRAudioSaladConfig } from '../configs/22r-report.config';
import { ReportImportWorkerService } from './report-import-worker.service';

describe('Report upload worker', () => {
	function setup(csv?: string) {
		const contents =
			csv ??
			',Transaction Date,DSP,ISRC,Track Title,Artist Name,Revenue in USD,Provider\n,"Thursday, January 1, 2026",Facebook,,N/A,,488.166,22R x Audio Salad\n,"Monday, December 1, 2025",Spotify,US38Y2309782,Title,Artist,2,22R x Audio Salad\n';
		const file = {
			...TwentyTwoRAudioSaladConfig,
			path: '22RxAudioSalad_082025-012026 - Sheet1.csv',
			r2Key: 'reports/file.csv',
			size: Buffer.byteLength(contents),
		};
		const job: any = {
			id: randomUUID(),
			status: 'PENDING',
			tenantId: 'tenant',
			params: { files: [file] },
		};
		let facts: FactSalesRow[] = [];
		const locks = {
			assertHeld: jest.fn(),
			release: jest.fn().mockResolvedValue(undefined),
		};
		const queue = {
			acquireImportLocks: jest.fn().mockResolvedValue(locks),
			invalidateAnalyticsCache: jest.fn().mockResolvedValue(undefined),
			ackJob: jest.fn().mockResolvedValue(undefined),
		};
		const r2 = {
			getBucketName: jest.fn().mockReturnValue('private'),
			getObjectStream: jest
				.fn()
				.mockImplementation(async () => Readable.from([contents])),
			deletePrivate: jest.fn().mockResolvedValue(undefined),
		};
		const jobs = {
			getSnapshot: jest.fn(() => job),
			findById: jest.fn(async () => job),
			updateProgress: jest.fn(),
			markProcessing: jest.fn(async () => {
				job.status = 'PROCESSING';
			}),
			patchParams: jest.fn(async (_id, p) => {
				job.params = {
					...job.params,
					...JSON.parse(JSON.stringify(p)),
				};
			}),
			markCompleted: jest.fn(async (_id, result) => {
				job.status = 'COMPLETED';
				job.result = result;
			}),
			markFailed: jest.fn(async (_id, error) => {
				job.status = 'FAILED';
				job.error = error;
			}),
		};
		const db = {
			insertBatched: jest.fn(async (_table, rows) => {
				facts.push(...rows);
			}),
			waitForTableMutations: jest.fn(),
			execute: jest.fn(async () => {
				facts = [];
			}),
			query: jest.fn(
				async (sql: string, params: Record<string, string> = {}) => {
					if (sql.includes('sum(revenue_usd)'))
						return [
							{
								rows: String(facts.length),
								revenue: formatReportDecimal(
									facts.reduce(
										(s, r) =>
											s +
											reportDecimalUnits(r.revenue_usd),
										0n,
									),
								),
							},
						];
					if (sql.includes('count() AS rows'))
						return [
							{
								rows: String(
									facts.filter(
										(r) => r.batch_id === params.batchId,
									).length,
								),
							},
						];
					if (sql.includes('count() AS cnt'))
						return [{ cnt: String(facts.length) }];
					if (sql.includes('SELECT DISTINCT dsp_id'))
						return [...new Set(facts.map((r) => r.dsp_id))].map(
							(dsp_id) => ({ dsp_id }),
						);
					if (sql.includes('argMax(track_title'))
						return facts
							.filter(
								(r) =>
									r.dsp_id === params.dsp0 &&
									r.isrc !== 'N/A',
							)
							.map(
								({
									isrc,
									upc,
									track_title,
									artist_name,
									album_title,
									label_name,
								}) => ({
									isrc,
									upc,
									track_title,
									artist_name,
									album_title,
									label_name,
								}),
							);
					if (sql.includes('SELECT DISTINCT'))
						return [
							...new Set(
								facts.map((r) =>
									r.reporting_period_start.slice(0, 7),
								),
							),
						].map((period) => ({ period }));
					throw new Error('Unexpected query ' + sql);
				},
			),
		};
		const projections = {
			whileCubeViewsPaused: jest.fn(async (fn) => fn()),
			refreshAfterFactImport: jest.fn().mockResolvedValue(undefined),
		};
		const dsps = {
			resolveOrCreateDspReport: jest.fn(async (name, source) => ({
				id_dsps_report: name + '-' + source,
			})),
			getDspsReportById: jest.fn(async () => ({ pg_uuid: 'pg' })),
			getPgDspsSyncByUuid: jest.fn(async () => ({ type: 'audio' })),
		};
		const metadata = {
			extractAndImport: jest
				.fn()
				.mockResolvedValue({
					totalReleases: 1,
					created: 1,
					skipped: 0,
					errors: 0,
					inDb: 0,
					pending: 0,
				}),
		};
		const stats = { refreshStats: jest.fn() };
		const history = { upsert: jest.fn().mockResolvedValue(undefined) };
		const worker = new ReportImportWorkerService(
			queue as never,
			r2 as never,
			jobs as never,
			projections as never,
			dsps as never,
			db as never,
			metadata as never,
			{} as never,
			{} as never,
			history as never,
			stats as never,
		);
		return {
			worker,
			run: () => worker['processJob'](job.id),
			job,
			file,
			queue,
			locks,
			r2,
			jobs,
			db,
			projections,
			dsps,
			metadata,
			stats,
			history,
			getFacts: () => facts,
		};
	}
	it('downloads, validates, imports all revenue, skips N/A metadata and rebuilds every month', async () => {
		const s = setup();
		await s.run();
		expect(s.job.error).toBeUndefined();
		expect(s.job.status).toBe('COMPLETED');
		expect(s.getFacts()).toHaveLength(2);
		expect(s.getFacts()).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					ingest_tenant_id: 'tenant',
					ingest_label_id: '',
				}),
			]),
		);
		expect(s.queue.acquireImportLocks).toHaveBeenCalledWith([
			JSON.stringify([
				'tenant',
				'audio_salad_report',
				'22RxAudioSalad_082025-012026 - Sheet1.csv',
			]),
		]);
		expect(s.dsps.resolveOrCreateDspReport).toHaveBeenCalledWith(
			'Facebook',
			'audio_salad_report',
		);
		expect(s.dsps.resolveOrCreateDspReport).toHaveBeenCalledWith(
			'Spotify',
			'audio_salad_report',
		);
		expect(s.metadata.extractAndImport).toHaveBeenCalledTimes(1);
		expect(s.metadata.extractAndImport.mock.calls[0][0][0].isrc).toBe(
			'US38Y2309782',
		);
		expect(s.job.result.files[0].validation).toMatchObject({
			totalRows: 2,
			missingIdentifierRows: 1,
			revenueUsd: '490.166000000000000000',
		});
		expect(
			[
				...s.projections.refreshAfterFactImport.mock.calls[0][0]
					.salesPeriods,
			].sort(),
		).toEqual(['2025-12', '2026-01']);
		expect(s.stats.refreshStats).toHaveBeenCalledWith(
			expect.arrayContaining([
				'Facebook-audio_salad_report',
				'Spotify-audio_salad_report',
			]),
		);
		expect(s.r2.deletePrivate).toHaveBeenCalledTimes(1);
		expect(s.locks.release).toHaveBeenCalledTimes(1);
	});
	it('fails validation before deleting previous facts or creating DSPs', async () => {
		const s = setup('ISRC,DSP\ninvalid,Facebook\n');
		await s.run();
		expect(s.job.status).toBe('FAILED');
		expect(s.job.error).toContain('Missing report headers');
		expect(s.db.execute).not.toHaveBeenCalled();
		expect(s.dsps.resolveOrCreateDspReport).not.toHaveBeenCalled();
		expect(s.r2.deletePrivate).not.toHaveBeenCalled();
	});
	it('retries a failed cube rebuild from FACT_IMPORTED without downloading or inserting again', async () => {
		const s = setup();
		s.projections.refreshAfterFactImport.mockRejectedValueOnce(
			new Error('cube failed'),
		);
		await s.run();
		expect(s.job.status).toBe('FAILED');
		expect(s.job.params.reportImportState.files[s.file.r2Key].status).toBe(
			'FACT_IMPORTED',
		);
		expect(s.r2.deletePrivate).not.toHaveBeenCalled();
		s.job.status = 'QUEUED';
		await s.run();
		expect(s.job.status).toBe('COMPLETED');
		expect(s.r2.getObjectStream).toHaveBeenCalledTimes(1);
		expect(s.db.insertBatched).toHaveBeenCalledTimes(1);
		expect(s.getFacts()).toHaveLength(2);
	});
	it('replaces partial facts on retry when insert fails after writing', async () => {
		const s = setup();
		const insert = s.db.insertBatched.getMockImplementation()!;
		s.db.insertBatched.mockImplementationOnce(async (...args) => {
			await insert(...args);
			throw new Error('connection lost after insert');
		});
		await s.run();
		expect(s.job.status).toBe('FAILED');
		expect(s.getFacts()).toHaveLength(2);
		s.job.status = 'QUEUED';
		await s.run();
		expect(s.job.error).toBeDefined();
		expect(s.job.status).toBe('COMPLETED');
		expect(s.getFacts()).toHaveLength(2);
		expect(s.db.execute).toHaveBeenCalledTimes(1);
	});
});
