import * as ExcelJS from 'exceljs';
import { ExportRunner, ExportRunnerDeps } from './export-runner';

// adm-zip does not ship TypeScript declarations in this project.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const AdmZip = require('adm-zip');

describe('ExportRunner artifact completion', () => {
	it.each(['csv', 'xlsx'] as const)(
		'uploads %s only after the last batch has been written into the ZIP',
		async (format) => {
			let releaseLastBatch!: () => void;
			const lastBatch = new Promise<void>((resolve) => {
				releaseLastBatch = resolve;
			});
			let firstBatchWritten!: () => void;
			const firstBatch = new Promise<void>((resolve) => {
				firstBatchWritten = resolve;
			});
			const rows = Array.from({ length: 1203 }, (_, i) => ({
				date: '2026-01-01',
				start_date: '2026-01-01',
				end_date: '2026-01-31',
				tenant_id: 'system-tenant',
				isrc: `ISRC-${i}`,
				fallback_track_title: `Track ${i}`,
				total_usage: '1',
				revenue_usd: '0.01',
				territory: 'VN',
				dsp_name: 'DSP',
			}));
			let finishUpload!: () => void;
			const uploadFinished = new Promise<void>((resolve) => {
				finishUpload = resolve;
			});
			let inspectUpload!: () => void;
			const inspected = new Promise<void>((resolve) => {
				inspectUpload = resolve;
			});
			const upload = jest.fn(async ({ filePath }) => {
				const zip = new AdmZip(filePath);
				const entry = zip
					.getEntries()
					.find((item: any) =>
						item.entryName.endsWith(`detail.${format}`),
					);
				expect(entry).toBeDefined();
				const contents = zip.readFile(entry);
				if (format === 'csv') {
					const lines = contents.toString('utf8').trim().split('\n');
					expect(lines).toHaveLength(rows.length + 1);
					expect(lines[lines.length - 1]).toContain('ISRC-1202');
				} else {
					const workbook = new ExcelJS.Workbook();
					await workbook.xlsx.load(contents);
					expect(workbook.worksheets[0].rowCount).toBe(
						rows.length + 1,
					);
					expect(
						workbook.worksheets[0]
							.getRow(rows.length + 1)
							.getCell(5).value,
					).toBe('ISRC-1202');
				}
				inspectUpload();
				await uploadFinished;
			});
			const signedUrl = jest
				.fn()
				.mockResolvedValue('https://example.test/export.zip');
			const onProgress = jest.fn().mockResolvedValue(undefined);
			const deps = {
				pgQuery: jest.fn().mockResolvedValue([]),
				chQueryStream: async (
					_sql: string,
					_params: unknown,
					onRows: any,
				) => {
					await onRows(rows.slice(0, 1200));
					firstBatchWritten();
					await lastBatch;
					await onRows(rows.slice(1200));
					return rows.length;
				},
				r2Upload: upload,
				r2SignedUrlDown: signedUrl,
				onProgress,
			} as unknown as ExportRunnerDeps;
			const result = new ExportRunner(deps, 'job-artifact').run(
				'system-tenant',
				{ fromDate: '2026-01', endDate: '2026-01', format },
			);
			await firstBatch;
			expect(upload).not.toHaveBeenCalled();
			releaseLastBatch();
			// Propagate artifact assertion errors instead of waiting indefinitely.
			await Promise.race([inspected, result]);
			expect(signedUrl).not.toHaveBeenCalled();
			expect(
				onProgress.mock.calls[onProgress.mock.calls.length - 1][0],
			).toMatchObject({
				progressCurrent: 4,
				totalRows: rows.length,
				processedRows: rows.length,
			});
			expect(onProgress.mock.calls[0][0].progressTotal).toBe(5);
			finishUpload();
			await expect(result).resolves.toMatchObject({
				totalRows: rows.length,
			});
		},
	);
});

describe('ExportRunner metadata windows', () => {
	it('fetches each window identifier once and preserves the existing release lookup rule', async () => {
		const pgQuery = jest
			.fn()
			.mockResolvedValueOnce([
				{
					isrc: 'ISRC-1',
					workspace_name: 'Workspace',
					release_title: 'Track release',
					release_upc: '111111111111',
					catalog_id: '',
					release_date: null,
					track_title: 'Track',
					label_name: 'Label',
					artist_names: 'Artist',
				},
			])
			.mockResolvedValueOnce([
				{
					upc: '111111111111',
					workspace_name: 'Workspace',
					release_title: 'Release metadata',
					release_upc: '111111111111',
					catalog_id: '',
					release_date: null,
					track_title: '',
					label_name: 'Release label',
					artist_names: 'Release artist',
				},
			])
			.mockResolvedValueOnce([
				{
					id: '11111111-1111-4111-8111-111111111111',
					tenant_name: 'Workspace',
				},
			]);
		const deps = { pgQuery } as unknown as ExportRunnerDeps;
		const runner = new ExportRunner(deps, 'job-1') as any;
		const cache = runner.createMetadataCache();
		const row = {
			isrc: 'ISRC-1',
			fallback_upc: '999999999999',
			tenant_id: '11111111-1111-4111-8111-111111111111',
		} as any;

		await runner.hydrateMetadataWindow([row], cache);
		await runner.hydrateMetadataWindow([row], cache);

		expect(pgQuery).toHaveBeenCalledTimes(3);
		expect(pgQuery.mock.calls[1][1]).toEqual([['111111111111']]);
	});
});

describe('ExportRunner statement-currency mapping', () => {
	it('uses the imported amount and currency instead of normalized USD', () => {
		const runner = new ExportRunner(
			{ pgQuery: jest.fn() } as unknown as ExportRunnerDeps,
			'job-statement',
		) as any;
		const cache = runner.createMetadataCache();

		const row = runner.enrichSingleRow(
			{
				date: '2026-01',
				start_date: '2026-01-01',
				end_date: '2026-01-31',
				tenant_id: '',
				isrc: 'ISRC-1',
				fallback_upc: '',
				fallback_track_title: 'Track',
				fallback_album_title: 'Album',
				fallback_artist_name: 'Artist',
				fallback_label_name: 'Label',
				dsp_name: 'DSP',
				territory: 'VN',
				total_usage: '1',
				revenue_amount: '12.34',
				revenue_usd: '1.23',
				currency: 'EUR',
			},
			new Map(),
			cache,
		);

		expect(row.revenueUsd).toBe('12.34');
		expect(row.currency).toBe('EUR');
	});

	it('queries the statement cube and creates one exact-currency folder per currency', async () => {
		let streamedSql = '';
		const rows = [
			{
				date: '2026-01',
				start_date: '2026-01-01',
				end_date: '2026-01-31',
				tenant_id: 'system-tenant',
				isrc: '',
				fallback_upc: '',
				fallback_track_title: 'EUR Track',
				fallback_album_title: 'Album',
				fallback_artist_name: 'Artist',
				fallback_label_name: 'Label',
				dsp_name: 'DSP',
				territory: 'DE',
				total_usage: '2',
				revenue_amount: '12.34',
				revenue_usd: '13.37',
				currency: 'EUR',
			},
			{
				date: '2026-01',
				start_date: '2026-01-01',
				end_date: '2026-01-31',
				tenant_id: 'system-tenant',
				isrc: '',
				fallback_upc: '',
				fallback_track_title: 'VND Track',
				fallback_album_title: 'Album',
				fallback_artist_name: 'Artist',
				fallback_label_name: 'Label',
				dsp_name: 'DSP',
				territory: 'VN',
				total_usage: '3',
				revenue_amount: '25000',
				revenue_usd: '1',
				currency: 'VND',
			},
		];
		const upload = jest.fn(({ filePath }) => {
			const zip = new AdmZip(filePath);
			const eurDetail = zip
				.readAsText('System_Tenant/EUR/detail.csv')
				.replace(/^\uFEFF/, '');
			const eurSummary = zip.readAsText('System_Tenant/EUR/summary.csv');
			const vndDetail = zip
				.readAsText('System_Tenant/VND/detail.csv')
				.replace(/^\uFEFF/, '');
			const vndSummary = zip.readAsText('System_Tenant/VND/summary.csv');

			expect(eurDetail).toContain('12.34,EUR');
			expect(eurDetail).not.toContain('13.37,EUR');
			expect(eurSummary).toContain('Revenue,Currency');
			expect(eurSummary).toContain('12.34,EUR');
			expect(vndDetail).toContain('25000,VND');
			expect(vndSummary).toContain('25000,VND');
		});
		const deps = {
			pgQuery: jest.fn().mockResolvedValue([]),
			chQueryStream: async (
				sql: string,
				_params: unknown,
				onRows: any,
			) => {
				streamedSql = sql;
				await onRows(rows);
				return rows.length;
			},
			r2Upload: upload,
			r2SignedUrlDown: jest
				.fn()
				.mockResolvedValue('https://example.test/statement.zip'),
		} as unknown as ExportRunnerDeps;

		const result = await new ExportRunner(deps, 'job-statement').run(
			'system-tenant',
			{
				fromDate: '2026-01',
				endDate: '2026-01',
				format: 'csv',
				exportMode: 'statement',
			} as any,
		);

		expect(streamedSql).toContain('FROM sales_statement_monthly_cube s');
		expect(upload).toHaveBeenCalledTimes(1);
		expect(result).toMatchObject({ totalRows: 2 });
		expect(result.fileName).toContain('_statement-report_');
	});
});

describe('ExportRunner reporting currency', () => {
	function rawRow(revenue: string) {
		return {
			date: '2026-01',
			start_date: '2026-01-01',
			end_date: '2026-01-31',
			tenant_id: 'system-tenant',
			isrc: 'ISRC-1',
			fallback_upc: '',
			fallback_track_title: 'Track',
			fallback_album_title: 'Album',
			fallback_artist_name: 'Artist',
			fallback_label_name: 'Label',
			dsp_name: 'DSP',
			territory: 'VN',
			total_usage: '1',
			revenue_amount: revenue,
			revenue_usd: revenue,
			currency: 'USD',
		};
	}

	it('keeps the USD stream and amount unchanged', async () => {
		let streamedSql = '';
		const chQuery = jest.fn();
		const upload = jest.fn(({ filePath }) => {
			const zip = new AdmZip(filePath);
			const detail = zip
				.readAsText('System_Tenant/detail.csv')
				.replace(/^\uFEFF/, '');
			const summary = zip.readAsText('System_Tenant/summary.csv');
			expect(detail).toContain('10.5,USD');
			expect(summary).toContain('RevenueUsd,Currency');
			expect(summary).toContain('10.5,USD');
		});
		const deps = {
			pgQuery: jest.fn().mockResolvedValue([]),
			chQuery,
			chQueryStream: async (
				sql: string,
				_params: unknown,
				onRows: any,
			) => {
				streamedSql = sql;
				await onRows([rawRow('10.5')]);
				return 1;
			},
			r2Upload: upload,
			r2SignedUrlDown: jest
				.fn()
				.mockResolvedValue('https://example.test/usd.zip'),
		} as unknown as ExportRunnerDeps;

		const result = await new ExportRunner(deps, 'job-usd').run(
			'system-tenant',
			{ fromDate: '2026-01', endDate: '2026-01', format: 'csv' },
		);

		expect(chQuery).not.toHaveBeenCalled();
		expect(streamedSql).not.toContain('exchange_rates');
		expect(streamedSql).not.toContain('multiplyDecimal');
		expect(result.fileName).toContain('_analytics-report_');
		expect(result.fileName).not.toContain('_VND_');
		expect(upload).toHaveBeenCalledTimes(1);
	});

	it('multiplies each grouped detail row and sums the converted amounts', async () => {
		let streamedSql = '';
		const chQuery = jest.fn(async (sql: string) => {
			if (sql.includes('system.parts')) return [{ partition: '202601' }];
			if (sql.includes('exchange_rates')) {
				return [{ rate_month: '2026-01', usd_to_local_rate: '25434' }];
			}
			throw new Error(sql);
		});
		const chQueryStream = jest.fn(
			async (sql: string, _params: unknown, onRows: any) => {
				streamedSql = sql;
				await onRows([
					rawRow('10.5'),
					{ ...rawRow('1'), isrc: 'ISRC-2' },
				]);
				return 2;
			},
		);
		const upload = jest.fn(({ filePath }) => {
			const zip = new AdmZip(filePath);
			const detail = zip
				.readAsText('System_Tenant/detail.csv')
				.replace(/^\uFEFF/, '');
			const summary = zip.readAsText('System_Tenant/summary.csv');
			expect(detail).toContain('267057,VND');
			expect(detail).toContain('25434,VND');
			expect(detail).not.toContain('10.5,VND');
			expect(summary).toContain('Revenue,Currency');
			expect(summary).not.toContain('RevenueUsd');
			expect(summary).toContain('292491,VND');
		});
		const deps = {
			pgQuery: jest.fn().mockResolvedValue([]),
			chQuery,
			chQueryStream,
			r2Upload: upload,
			r2SignedUrlDown: jest
				.fn()
				.mockResolvedValue('https://example.test/vnd.zip'),
		} as unknown as ExportRunnerDeps;

		const result = await new ExportRunner(deps, 'job-vnd').run(
			'system-tenant',
			{
				fromDate: '2026-01',
				endDate: '2026-01',
				format: 'csv',
				currency: 'VND',
			},
		);

		expect(chQueryStream).toHaveBeenCalledTimes(1);
		expect(streamedSql).not.toContain('exchange_rates');
		expect(streamedSql).not.toContain('multiplyDecimal');
		expect(result.fileName).toContain('_analytics-report_VND_');
		expect(upload).toHaveBeenCalledTimes(1);
	});

	it('fails before streaming when a cube month has no rate', async () => {
		const chQueryStream = jest.fn();
		const deps = {
			pgQuery: jest.fn(),
			chQuery: jest.fn(async (sql: string) => {
				if (sql.includes('system.parts')) {
					return [{ partition: '202601' }, { partition: '202602' }];
				}
				if (sql.includes('exchange_rates')) {
					return [
						{ rate_month: '2026-01', usd_to_local_rate: '25434' },
					];
				}
				throw new Error(sql);
			}),
			chQueryStream,
			r2Upload: jest.fn(),
			r2SignedUrlDown: jest.fn(),
		} as unknown as ExportRunnerDeps;

		await expect(
			new ExportRunner(deps, 'job-missing-rate').run('system-tenant', {
				fromDate: '2026-01',
				endDate: '2026-02',
				format: 'csv',
				currency: 'VND',
			}),
		).rejects.toThrow(/Missing VND exchange rate for month\(s\): 2026-02/);
		expect(chQueryStream).not.toHaveBeenCalled();
	});

	it('falls back to the period column when system.parts is not readable', async () => {
		const chQuery = jest.fn(async (sql: string) => {
			if (sql.includes('system.parts')) {
				throw new Error('Not enough privileges');
			}
			if (sql.includes('formatDateTime(period')) {
				return [{ rate_month: '2026-01' }];
			}
			if (sql.includes('exchange_rates')) {
				return [{ rate_month: '2026-01', usd_to_local_rate: '2' }];
			}
			throw new Error(sql);
		});
		const upload = jest.fn(({ filePath }) => {
			const zip = new AdmZip(filePath);
			const detail = zip
				.readAsText('System_Tenant/detail.csv')
				.replace(/^\uFEFF/, '');
			expect(detail).toContain('21,GBP');
		});
		const deps = {
			pgQuery: jest.fn().mockResolvedValue([]),
			chQuery,
			chQueryStream: async (
				_sql: string,
				_params: unknown,
				onRows: any,
			) => {
				await onRows([rawRow('10.5')]);
				return 1;
			},
			r2Upload: upload,
			r2SignedUrlDown: jest
				.fn()
				.mockResolvedValue('https://example.test/gbp.zip'),
		} as unknown as ExportRunnerDeps;

		await new ExportRunner(deps, 'job-gbp').run('system-tenant', {
			fromDate: '2026-01',
			endDate: '2026-01',
			format: 'csv',
			currency: 'GBP',
		});

		expect(chQuery.mock.calls.map((call) => call[0]).join('\n')).toContain(
			'formatDateTime(period',
		);
		expect(upload).toHaveBeenCalledTimes(1);
	});
});
