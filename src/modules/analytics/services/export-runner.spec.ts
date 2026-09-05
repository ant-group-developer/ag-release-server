import * as ExcelJS from 'exceljs';
import { ExportRunner, ExportRunnerDeps } from './export-runner';

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
				{ fromDate: '2026-01', endDate: '2026-01', format } as any,
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
