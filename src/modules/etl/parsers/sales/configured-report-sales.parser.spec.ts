import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
	TwentyTwoRAudioSaladConfig,
	TwentyTwoRWmgConfig,
} from '../../../report-import/configs/22r-report.config';
import { ReportSourceConfig } from '../../../report-import/configs/report-source.interface';
import { FactSalesRow } from '../../interfaces';
import {
	ConfiguredReportSalesParser,
	formatReportDecimal,
	reportDecimalUnits,
} from './configured-report-sales.parser';

describe('Configured report revenue parser', () => {
	let dir: string;
	beforeEach(async () => {
		dir = await fs.mkdtemp(path.join(os.tmpdir(), 'report-parser-test-'));
	});
	afterEach(async () => {
		await fs.rm(dir, { recursive: true, force: true });
	});
	const csv = (rows: string[][]) =>
		rows
			.map((row) =>
				row.map((v) => '"' + v.replace(/"/g, '""') + '"').join(','),
			)
			.join('\r\n');
	async function fixture(
		config: ReportSourceConfig,
		records: Record<string, string>[],
	) {
		const headers = ['', ...config.requiredHeaders];
		const file = path.join(dir, 'report.csv');
		await fs.writeFile(
			file,
			'\uFEFF' +
				csv([
					headers,
					...records.map((row) => headers.map((h) => row[h] || '')),
				]),
		);
		return file;
	}
	function row(
		config: ReportSourceConfig,
		extras: Record<string, string> = {},
	) {
		return {
			'Transaction Date': 'Thursday, January 1, 2026',
			ISRC: 'US38Y2309782',
			'Artist Name': 'Khia',
			'Track Title': 'My Neck, "My Back"',
			'Revenue in USD': '1.23E-7',
			Provider: config.defaultMember,
			DSP: 'Youtube',
			'DSP Clean': 'GOOGLE LLC',
			...extras,
		};
	}
	async function collect(config: ReportSourceConfig, file: string) {
		const parser = new ConfiguredReportSalesParser(config),
			summary = await parser.validateFile(file);
		const rows: FactSalesRow[] = [];
		await parser.parseFileStreaming(
			file,
			'job',
			async (batch) => {
				rows.push(...batch);
			},
			{
				batchSize: 2,
				dspIds: new Map(
					summary.dsps.map((dsp) => [dsp, 'uuid-' + dsp]),
				),
			},
		);
		return { summary, rows };
	}
	it('maps numeric WMG identifiers to album UPC rows, preserving decimals and duplicate adjustments', async () => {
		const config = TwentyTwoRWmgConfig;
		const record = row(config, {
			ISRC: '0005034644709505',
			'Revenue in USD': '-0.000000000000000001',
		});
		const file = await fixture(config, [record, record, row(config)]);
		const { rows, summary } = await collect(config, file);
		expect(rows).toHaveLength(3);
		expect(rows[0]).toMatchObject({
			isrc: 'UPC-5034644709505',
			upc: '5034644709505',
			revenue_usd: '-0.000000000000000001',
			revenue_currency: 'USD',
			import_source: 'wmg_report',
			service_name: 'YouTube',
			quantity: 0,
			reporting_period_start: '2026-01-01',
			reporting_period_end: '2026-01-31',
		});
		expect(rows[0].metadata).toMatchObject({
			is_album_level: 'true',
			raw_identifier: '0005034644709505',
			dsp_clean: 'GOOGLE LLC',
		});
		expect(rows[2].upc).toBe('ISRC-US38Y2309782');
		expect(summary).toMatchObject({
			totalRows: 3,
			upcRows: 2,
			negativeRows: 2,
			missingIdentifierRows: 0,
			revenueUsd: '0.000000122999999998',
		});
	});
	it('keeps Audio Salad missing identifiers and titles as N/A without dropping their revenue', async () => {
		const config = TwentyTwoRAudioSaladConfig;
		const file = await fixture(config, [
			row(config, {
				ISRC: '',
				'Track Title': 'NA',
				'Artist Name': '',
				'Revenue in USD': '488.166',
			}),
			row(config, { 'Revenue in USD': '0' }),
		]);
		const { rows, summary } = await collect(config, file);
		expect(rows[0]).toMatchObject({
			isrc: 'N/A',
			upc: 'N/A',
			track_title: 'N/A',
			artist_name: 'N/A',
			import_source: 'audio_salad_report',
			revenue_usd: '488.166000000000000000',
		});
		expect(summary).toMatchObject({
			totalRows: 2,
			zeroRows: 1,
			missingIdentifierRows: 1,
			missingIdentifierRevenueUsd: '488.166000000000000000',
		});
	});
	it('handles reordered headers, quoted multiline text and leap-year month boundaries', async () => {
		const config = {
			...TwentyTwoRAudioSaladConfig,
			requiredHeaders: [
				...TwentyTwoRAudioSaladConfig.requiredHeaders,
			].reverse(),
		};
		const file = await fixture(config, [
			row(config, {
				'Track Title': 'One\nTwo, "Three"',
				'Transaction Date': 'Thursday, February 1, 2024',
			}),
		]);
		const { rows } = await collect(config, file);
		expect(rows[0].track_title).toBe('One\nTwo, "Three"');
		expect(rows[0].reporting_period_end).toBe('2024-02-29');
	});
	it.each<Record<string, string>>([
		{ 'Revenue in USD': 'NaN' },
		{ 'Revenue in USD': 'Infinity' },
		{ 'Revenue in USD': '' },
		{ 'Revenue in USD': '1USD' },
		{ 'Transaction Date': 'Monday, February 30, 2026' },
		{ 'Transaction Date': '2026-01-01' },
		{ Provider: 'wrong provider' },
		{ DSP: '' },
		{ ISRC: 'invalid' },
	])('fails invalid report data with a line number: %j', async (extras) => {
		const config = TwentyTwoRAudioSaladConfig,
			file = await fixture(config, [row(config, extras)]);
		await expect(
			new ConfiguredReportSalesParser(config).validateFile(file),
		).rejects.toThrow('line 2:');
	});
	it('fails missing and duplicate headers', async () => {
		const file = path.join(dir, 'report.csv'),
			parser = new ConfiguredReportSalesParser(TwentyTwoRWmgConfig);
		await fs.writeFile(file, 'ISRC,ISRC\nx,y');
		await expect(parser.validateFile(file)).rejects.toThrow(
			'Duplicate report header',
		);
		await fs.writeFile(file, 'ISRC,DSP\nx,y');
		await expect(parser.validateFile(file)).rejects.toThrow(
			'Missing report headers',
		);
	});
	it('propagates failed batch inserts and stops instead of skipping a row or retrying the same buffer', async () => {
		const config = TwentyTwoRWmgConfig,
			file = await fixture(config, [
				row(config),
				row(config),
				row(config),
			]);
		const callback = jest
			.fn()
			.mockRejectedValue(new Error('ClickHouse insert failed'));
		await expect(
			new ConfiguredReportSalesParser(config).parseFileStreaming(
				file,
				'job',
				callback,
				{ batchSize: 2, dspIds: new Map([['YouTube', 'uuid']]) },
			),
		).rejects.toThrow('ClickHouse insert failed');
		expect(callback).toHaveBeenCalledTimes(1);
	});
	it('rejects invalid UTF-8 and missing files without hanging the stream', async () => {
		const file = path.join(dir, 'bad.csv');
		await fs.writeFile(file, Buffer.from([0xc3, 0x28]));
		await expect(
			new ConfiguredReportSalesParser(TwentyTwoRWmgConfig).validateFile(
				file,
			),
		).rejects.toThrow();
		await expect(
			new ConfiguredReportSalesParser(TwentyTwoRWmgConfig).validateFile(
				file + '.missing',
			),
		).rejects.toThrow();
	});
	it('preserves supported decimal precision and rejects overflow/underflow', () => {
		expect(formatReportDecimal(reportDecimalUnits('3.456E-12'))).toBe(
			'0.000000000003456000',
		);
		expect(reportDecimalUnits('1.0000000000000000000')).toBe(10n ** 18n);
		expect(() => reportDecimalUnits('1e-19')).toThrow('precision');
		expect(() => reportDecimalUnits('1e20')).toThrow('precision');
	});
});
