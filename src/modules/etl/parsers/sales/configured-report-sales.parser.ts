import { parse } from 'csv-parse';
import * as fs from 'fs';
import * as path from 'path';
import {
	normalizeReportUpcOrFallback,
	normalizeStandardUpcOrEmpty,
} from 'src/utils/upc.util';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { validateReportConfig } from '../../../report-import/configs/report-config.util';
import {
	ReportSourceConfig,
	resolveReportImportSource,
} from '../../../report-import/configs/report-source.interface';
import { FactSalesRow } from '../../interfaces';
import { normalizeFactRows } from '../../utils/fact-row-normalizer.util';
import { BaseSalesParser } from './base-sales.parser';

const SCALE = 18;
const MONTHS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December',
];
const WEEKDAYS = [
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday',
];

/** Decimal128(18), including scientific notation, without a floating point conversion. */
export function reportDecimalUnits(input: string): bigint {
	const m = input
		.trim()
		.match(/^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/);
	if (!m || input.length > 160) throw new Error(`Invalid decimal: ${input}`);
	const fraction = m[3] || '';
	const exponent = Number(m[4] || 0);
	if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 100)
		throw new Error(`Decimal exponent out of range: ${input}`);
	let digits = (m[2] + fraction).replace(/^0+/, '') || '0';
	let shift = SCALE + exponent - fraction.length;
	if (digits === '0') return 0n;
	while (shift < 0 && digits.endsWith('0')) {
		digits = digits.slice(0, -1);
		shift++;
	}
	if (shift < 0 || digits.length + shift > 38)
		throw new Error(`Decimal128(18) precision exceeded: ${input}`);
	return (m[1] === '-' ? -1n : 1n) * BigInt(digits) * 10n ** BigInt(shift);
}

export function formatReportDecimal(units: bigint): string {
	const digits = (units < 0n ? -units : units)
		.toString()
		.padStart(SCALE + 1, '0');
	return `${units < 0n ? '-' : ''}${digits.slice(0, -SCALE)}.${digits.slice(-SCALE)}`;
}

function monthRange(input: string): [string, string] {
	const m = input
		.trim()
		.match(
			/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday), ([A-Za-z]+) (\d{1,2}), (\d{4})$/,
		);
	if (!m) throw new Error(`Invalid English report date: ${input}`);
	const month = MONTHS.indexOf(m[2]);
	const year = Number(m[4]),
		day = Number(m[3]);
	const date = new Date(Date.UTC(year, month, day));
	if (
		month < 0 ||
		year < 1970 ||
		year > 2148 ||
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== month ||
		date.getUTCDate() !== day ||
		WEEKDAYS[date.getUTCDay()] !== m[1]
	)
		throw new Error(`Invalid calendar date: ${input}`);
	const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
	return [
		`${prefix}-01`,
		`${prefix}-${new Date(Date.UTC(year, month + 1, 0)).getUTCDate()}`,
	];
}

export interface ReportValidationSummary {
	totalRows: number;
	revenueUsd: string;
	missingIdentifierRows: number;
	missingIdentifierRevenueUsd: string;
	upcRows: number;
	zeroRows: number;
	negativeRows: number;
	dsps: string[];
	periods: string[];
	byPeriodDsp: Array<{
		period: string;
		dsp: string;
		rows: number;
		revenueUsd: string;
	}>;
	warnings: Array<{ line: number; message: string }>;
}

export class ConfiguredReportSalesParser extends BaseSalesParser {
	constructor(private readonly config: ReportSourceConfig) {
		super('');
		validateReportConfig(config);
	}

	protected parseRow(
		record: Record<string, string>,
		batchId: string,
		filePath: string,
	): FactSalesRow {
		const row = this.createBaseRow(batchId);
		row.revenue_currency = 'USD';
		row.member_name = this.config.defaultMember || 'N/A';
		row.source_file_name = path.basename(filePath);
		row.import_source = resolveReportImportSource(this.config);
		for (const mapping of this.config.fieldMappings!) {
			if (mapping.targetColumn === 'skip') continue;
			const raw = record[mapping.reportColumn.trim().toLowerCase()] ?? '';
			let value = raw.trim();
			switch (mapping.transform || 'trim') {
				case 'raw':
					value = raw;
					break;
				case 'uppercase':
					value = value.toUpperCase();
					break;
				case 'isrc':
					value = value.toUpperCase().replace(/[-\s]/g, '');
					break;
				case 'decimal':
					value = formatReportDecimal(reportDecimalUnits(raw));
					break;
				case 'month_start_en_long':
					value = monthRange(raw)[0];
					break;
				case 'month_end_en_long':
					value = monthRange(raw)[1];
					break;
			}
			if (mapping.targetColumn.startsWith('metadata.'))
				row.metadata[mapping.targetColumn.slice(9)] = value;
			else
				(row as unknown as Record<string, unknown>)[
					mapping.targetColumn
				] = value;
			if (mapping.targetColumn === 'isrc')
				row.metadata.raw_identifier = raw;
			if (mapping.targetColumn === 'reporting_period_start')
				row.metadata.raw_transaction_date = raw;
			if (mapping.targetColumn === 'revenue_usd')
				row.metadata.raw_revenue_usd = raw;
		}
		const opts = this.config.parserOptions || {};
		if (!row.service_name.trim() || /^(N\/A|NA)$/i.test(row.service_name))
			throw new Error('DSP is required');
		if (opts.expectedProvider && row.member_name !== opts.expectedProvider)
			throw new Error(
				`Provider must be ${opts.expectedProvider}, received ${row.member_name}`,
			);
		if (row.revenue_local !== row.revenue_usd)
			throw new Error('USD local revenue must equal USD revenue');
		if (
			row.reporting_period_start.slice(0, 7) !==
			row.reporting_period_end.slice(0, 7)
		)
			throw new Error('Reporting period must cover one month');
		row.metadata.dsp_raw = row.service_name;
		const alias = Object.entries(opts.dspAliases || {}).find(
			([key]) => key.toLowerCase() === row.service_name.toLowerCase(),
		);
		row.service_name = alias?.[1] || row.service_name;
		row.metadata.provider = row.member_name;
		row.metadata.quantity_provided = 'false';
		row.metadata.report_config_id =
			this.config.id ||
			`${this.config.sourceCode}_${this.config.reportType}`;
		if (this.config.configHash)
			row.metadata.report_config_hash = this.config.configHash;
		const identifier = row.isrc;
		if (opts.numericIdentifierIsUpc && /^\d+$/.test(identifier)) {
			const upc = normalizeStandardUpcOrEmpty(identifier);
			if (!upc) throw new Error(`Invalid UPC: ${identifier}`);
			row.upc = upc;
			row.isrc = `UPC-${upc}`;
			row.metadata.is_album_level = 'true';
			row.metadata.identifier_status = 'upc';
			if (!row.album_title || row.album_title === 'N/A')
				row.album_title = row.track_title;
		} else if (/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(identifier)) {
			row.upc = normalizeReportUpcOrFallback(row.upc, identifier);
			row.metadata.identifier_status = 'isrc';
		} else if (!identifier || /^(NA|N\/A)$/i.test(identifier)) {
			if (opts.missingIdentifierPolicy === 'reject')
				throw new Error('ISRC is required');
			row.isrc = 'N/A';
			row.upc = 'N/A';
			row.metadata.identifier_status = 'missing';
		} else throw new Error(`Invalid ISRC: ${row.metadata.raw_identifier}`);
		for (const field of [
			'track_title',
			'artist_name',
			'album_title',
		] as const)
			if (!row[field]?.trim() || /^(NA|N\/A)$/i.test(row[field].trim()))
				row[field] = 'N/A';
		normalizeFactRows([row]);
		return row;
	}

	private async *rows(
		filePath: string,
		batchId: string,
	): AsyncGenerator<FactSalesRow> {
		let headerSeen = false;
		const decoder = new TextDecoder('utf-8', { fatal: true });
		const utf8 = new Transform({
			transform(chunk, _encoding, done) {
				try {
					done(null, decoder.decode(chunk, { stream: true }));
				} catch (e) {
					done(e as Error);
				}
			},
			flush(done) {
				try {
					done(null, decoder.decode());
				} catch (e) {
					done(e as Error);
				}
			},
		});
		const parser = parse({
			bom: true,
			delimiter: this.config.delimiter,
			skip_empty_lines: true,
			info: true,
			from_line: this.config.parserOptions?.headerRow || 1,
			columns: (headers: string[]) => {
				headerSeen = true;
				const normalized = headers.map((h) => h.trim().toLowerCase());
				const names = normalized.filter(Boolean);
				if (new Set(names).size !== names.length)
					throw new Error('Duplicate report header');
				if (
					normalized.some((h) => !h) &&
					!this.config.parserOptions?.ignoreEmptyHeader
				)
					throw new Error('Empty report header');
				const required = [
					...this.config.requiredHeaders,
					...this.config
						.fieldMappings!.filter((m) => m.targetColumn !== 'skip')
						.map((m) => m.reportColumn),
				];
				const missing = required.filter(
					(h) => !names.includes(h.trim().toLowerCase()),
				);
				if (missing.length)
					throw new Error(
						`Missing report headers: ${[...new Set(missing)].join(', ')}`,
					);
				return normalized.map((h) => h || false);
			},
		});
		let streamError: Error | undefined;
		const completion = pipeline(
			fs.createReadStream(filePath),
			utf8,
			parser,
		).catch((e) => {
			streamError = e;
		});
		try {
			for await (const item of parser) {
				let row: FactSalesRow;
				try {
					row = this.parseRow(item.record, batchId, filePath);
				} catch (e) {
					throw new Error(
						`${path.basename(filePath)} line ${item.info.lines}: ${(e as Error).message}`,
					);
				}
				row.metadata.source_row_number = String(item.info.lines);
				yield row;
			}
			await completion;
			if (streamError) throw streamError;
			if (!headerSeen) throw new Error('Report is empty');
		} finally {
			parser.destroy();
			await completion;
		}
	}

	async validateFile(filePath: string): Promise<ReportValidationSummary> {
		const summary: ReportValidationSummary = {
			totalRows: 0,
			revenueUsd: '0',
			missingIdentifierRows: 0,
			missingIdentifierRevenueUsd: '0',
			upcRows: 0,
			zeroRows: 0,
			negativeRows: 0,
			dsps: [],
			periods: [],
			byPeriodDsp: [],
			warnings: [],
		};
		let total = 0n,
			missingTotal = 0n;
		const dsps = new Set<string>(),
			periods = new Set<string>();
		const groups = new Map<
			string,
			{ period: string; dsp: string; rows: number; units: bigint }
		>();
		for await (const row of this.rows(filePath, 'validation')) {
			summary.totalRows++;
			const units = reportDecimalUnits(row.revenue_usd);
			total += units;
			if (units === 0n) summary.zeroRows++;
			if (units < 0n) summary.negativeRows++;
			if (row.metadata.identifier_status === 'upc') summary.upcRows++;
			if (row.metadata.identifier_status === 'missing') {
				summary.missingIdentifierRows++;
				missingTotal += units;
				if (summary.warnings.length < 20)
					summary.warnings.push({
						line: Number(row.metadata.source_row_number),
						message:
							'Missing ISRC: revenue retained with N/A identifiers',
					});
			}
			const period = row.reporting_period_start.slice(0, 7),
				dsp = row.service_name;
			dsps.add(dsp);
			periods.add(period);
			const key = JSON.stringify([period, dsp]);
			const group = groups.get(key) || {
				period,
				dsp,
				rows: 0,
				units: 0n,
			};
			group.rows++;
			group.units += units;
			groups.set(key, group);
		}
		if (!summary.totalRows) throw new Error('Report contains no data rows');
		summary.revenueUsd = formatReportDecimal(total);
		summary.missingIdentifierRevenueUsd = formatReportDecimal(missingTotal);
		summary.dsps = [...dsps].sort();
		summary.periods = [...periods].sort();
		summary.byPeriodDsp = [...groups.values()].map(({ units, ...g }) => ({
			...g,
			revenueUsd: formatReportDecimal(units),
		}));
		return summary;
	}

	async parseFileStreaming(
		filePath: string,
		batchId: string,
		onBatch: (rows: FactSalesRow[]) => Promise<void>,
		opts: { batchSize?: number; dspIds: Map<string, string> },
	): Promise<{ totalRows: number; skippedRows: number }> {
		let batch: FactSalesRow[] = [],
			totalRows = 0;
		const batchSize = opts.batchSize ?? 50_000;
		if (!Number.isInteger(batchSize) || batchSize < 1)
			throw new Error('Invalid batch size');
		for await (const row of this.rows(filePath, batchId)) {
			const id = opts.dspIds.get(row.service_name);
			if (!id)
				throw new Error(`DSP was not resolved: ${row.service_name}`);
			row.dsp_id = id;
			batch.push(row);
			totalRows++;
			if (batch.length >= batchSize) {
				await onBatch(batch);
				batch = [];
			}
		}
		if (batch.length) await onBatch(batch);
		return { totalRows, skippedRows: 0 };
	}
}
