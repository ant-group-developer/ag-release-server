import * as ExcelJS from 'exceljs';
import * as fs from 'fs';

export interface DetailRowLike {
	[key: string]: unknown;
}

const DETAIL_COLUMNS = [
	{ header: 'Date', key: 'date' },
	{ header: 'Workspace', key: 'tenant' },
	{ header: 'DspName', key: 'dspName' },
	{ header: 'UPC', key: 'upc' },
	{ header: 'ISRC', key: 'isrc' },
	{ header: 'ReleaseName', key: 'releaseName' },
	{ header: 'TrackName', key: 'trackName' },
	{ header: 'ArtistName', key: 'artistName' },
	{ header: 'LabelName', key: 'labelName' },
	{ header: 'Territory', key: 'territory' },
	{ header: 'TotalUsage', key: 'totalUsage' },
	{ header: 'Revenue', key: 'revenueUsd' },
	{ header: 'Currency', key: 'currency' },
];

function csvEscape(value: unknown): string {
	const text = value == null ? '' : String(value);
	if (/[",\n\r]/.test(text)) {
		return `"${text.replace(/"/g, '""')}"`;
	}
	return text;
}

export interface IStreamDetailWriter {
	appendRow(row: DetailRowLike): boolean;
	ready(): Promise<void>;
	flush(): Promise<void>;
}

// ─── CSV Streaming Writer ────────────────────────────────────

export class CsvStreamDetailWriter implements IStreamDetailWriter {
	private readonly stream: fs.WriteStream;
	private headerWritten = false;
	private flushPromise?: Promise<void>;

	constructor(filePath: string, append = false) {
		this.headerWritten = append;
		this.stream = fs.createWriteStream(filePath, {
			encoding: 'utf8',
			flags: append ? 'a' : 'w',
		});
	}

	appendRow(row: DetailRowLike): boolean {
		let ready = true;
		if (!this.headerWritten) {
			const headers = DETAIL_COLUMNS.map((c) => csvEscape(c.header));
			ready = this.stream.write(`\uFEFF${headers.join(',')}\n`);
			this.headerWritten = true;
		}
		const values = DETAIL_COLUMNS.map((c) => csvEscape(row[c.key]));
		return this.stream.write(`${values.join(',')}\n`) && ready;
	}

	async ready(): Promise<void> {
		if (!this.stream.writableNeedDrain) return;
		await new Promise<void>((resolve, reject) => {
			const onDrain = () => done(resolve);
			const onError = (error: Error) => done(() => reject(error));
			const done = (callback: () => void) => {
				this.stream.off('drain', onDrain);
				this.stream.off('error', onError);
				callback();
			};
			this.stream.once('drain', onDrain);
			this.stream.once('error', onError);
		});
	}

	async flush(): Promise<void> {
		if (!this.flushPromise) {
			this.flushPromise = new Promise<void>((resolve, reject) => {
				this.stream.end((err?: Error | null) =>
					err ? reject(err) : resolve(),
				);
			});
		}

		return this.flushPromise;
	}
}

// ─── XLSX Streaming Writer ───────────────────────────────────

export class XlsxStreamDetailWriter implements IStreamDetailWriter {
	private readonly workbook: ExcelJS.stream.xlsx.WorkbookWriter;
	private readonly sheet: ExcelJS.Worksheet;
	private flushPromise?: Promise<void>;

	constructor(filePath: string) {
		this.workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
			filename: filePath,
			useStyles: true,
			useSharedStrings: false,
		});
		this.sheet = this.workbook.addWorksheet('Detail');
		this.sheet.columns = DETAIL_COLUMNS.map((c) => ({
			header: c.header,
			key: c.key,
			width: 18,
		}));
	}

	appendRow(row: DetailRowLike): boolean {
		this.sheet.addRow(row).commit();
		return true;
	}

	async ready(): Promise<void> {
		// ExcelJS commits rows synchronously to its streaming writer.
	}

	async flush(): Promise<void> {
		if (!this.flushPromise) {
			this.flushPromise = this.flushOnce();
		}

		return this.flushPromise;
	}

	private async flushOnce(): Promise<void> {
		this.sheet.commit();
		await this.workbook.commit();
	}
}

// ─── Summary Accumulator ─────────────────────────────────────

export interface SummaryAccumulator {
	totalUsage: number;
	revenueSumUnits: bigint;
	revenueScale: number;
	uniqueIsrcs: Set<string>;
	uniqueReleases: Set<string>;
	uniqueLabels: Set<string>;
	uniqueDsps: Set<string>;
	uniqueTerritories: Set<string>;
	uniqueArtists: Set<string>;
	minStartDate: string;
	maxEndDate: string;
	rowCount: number;
	tenantName: string;
	currency: string;
}

export function createEmptyAccumulator(): SummaryAccumulator {
	return {
		totalUsage: 0,
		revenueSumUnits: 0n,
		revenueScale: 0,
		uniqueIsrcs: new Set(),
		uniqueReleases: new Set(),
		uniqueLabels: new Set(),
		uniqueDsps: new Set(),
		uniqueTerritories: new Set(),
		uniqueArtists: new Set(),
		minStartDate: '',
		maxEndDate: '',
		rowCount: 0,
		tenantName: '',
		currency: '',
	};
}

function normalizeDecimal(value: unknown): string {
	const text = String(value ?? '0').trim();
	if (!text) return '0';
	if (!text.includes('e') && !text.includes('E')) return text;

	const numeric = Number(text);
	if (!Number.isFinite(numeric)) return '0';
	return numeric.toFixed(18).replace(/0+$/, '').replace(/\.$/, '') || '0';
}

function addRevenue(acc: SummaryAccumulator, value: unknown): void {
	const normalized = normalizeDecimal(value);
	const negative = normalized.startsWith('-');
	const unsigned =
		negative || normalized.startsWith('+')
			? normalized.slice(1)
			: normalized;

	if (!/^\d*(\.\d*)?$/.test(unsigned)) return;

	const [whole = '0', frac = ''] = unsigned.split('.');
	const scale = frac.length;
	if (scale > acc.revenueScale) {
		acc.revenueSumUnits *= 10n ** BigInt(scale - acc.revenueScale);
		acc.revenueScale = scale;
	}

	const digits = `${whole || '0'}${frac.padEnd(acc.revenueScale, '0')}`;
	const units = BigInt(digits || '0');
	acc.revenueSumUnits += negative ? -units : units;
}

export function formatRevenueSum(acc: SummaryAccumulator): string {
	const negative = acc.revenueSumUnits < 0n;
	const abs = negative ? -acc.revenueSumUnits : acc.revenueSumUnits;
	if (acc.revenueScale === 0)
		return `${negative ? '-' : ''}${abs.toString()}`;

	const padded = abs.toString().padStart(acc.revenueScale + 1, '0');
	const whole = padded.slice(0, -acc.revenueScale) || '0';
	const frac = padded.slice(-acc.revenueScale).replace(/0+$/, '');
	return `${negative ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
}

const REPORTING_RESULT_SCALE = 18;

interface ParsedDecimal {
	negative: boolean;
	units: bigint;
	scale: number;
}

function parseDecimal(value: string): ParsedDecimal {
	const text = String(value ?? '').trim();
	const match = text.match(/^([+-])?(\d*)(?:\.(\d*))?$/);
	if (!match || (!match[2] && match[3] == null)) {
		throw new Error(`Invalid decimal: ${value}`);
	}
	const whole = match[2] || '0';
	const frac = match[3] || '';
	const digits = `${whole}${frac}`.replace(/^0+(?=\d)/, '') || '0';
	const units = BigInt(digits);
	if (units === 0n) return { negative: false, units: 0n, scale: 0 };
	return { negative: match[1] === '-', units, scale: frac.length };
}

function roundHalfAwayFromZero(
	units: bigint,
	scale: number,
	resultScale: number,
): bigint {
	if (scale <= resultScale) {
		return units * 10n ** BigInt(resultScale - scale);
	}
	const divisor = 10n ** BigInt(scale - resultScale);
	const truncated = units / divisor;
	const remainder = units % divisor;
	return remainder * 2n >= divisor ? truncated + 1n : truncated;
}

function formatScaledDecimal(
	units: bigint,
	scale: number,
	negative: boolean,
): string {
	if (units === 0n) return '0';
	const digits = units.toString().padStart(scale + 1, '0');
	const whole = digits.slice(0, digits.length - scale);
	const frac = digits.slice(digits.length - scale).replace(/0+$/, '');
	return `${negative ? '-' : ''}${whole}${frac ? `.${frac}` : ''}`;
}

/**
 * Multiply two decimal strings and round half away from zero to `resultScale`.
 * Matches ClickHouse multiplyDecimal(..., result_scale) without going through float.
 */
export function multiplyDecimal(
	amount: string,
	rate: string,
	resultScale = REPORTING_RESULT_SCALE,
): string {
	const left = parseDecimal(amount);
	const right = parseDecimal(rate);
	if (left.units === 0n || right.units === 0n) return '0';
	const rounded = roundHalfAwayFromZero(
		left.units * right.units,
		left.scale + right.scale,
		resultScale,
	);
	return formatScaledDecimal(
		rounded,
		resultScale,
		left.negative !== right.negative,
	);
}

export function updateAccumulator(
	acc: SummaryAccumulator,
	row: DetailRowLike,
): void {
	acc.rowCount++;
	acc.totalUsage += Number(row.totalUsage ?? 0);
	addRevenue(acc, row.revenueUsd);
	if (!acc.currency) acc.currency = String(row.currency ?? '');

	const isrc = String(row.isrc ?? '');
	if (isrc) acc.uniqueIsrcs.add(isrc);

	const rel = String(row.releaseName || row.upc || '');
	if (rel) acc.uniqueReleases.add(rel);

	const label = String(row.labelName ?? '');
	if (label) acc.uniqueLabels.add(label);

	const dsp = String(row.dspName ?? '');
	if (dsp) acc.uniqueDsps.add(dsp);

	const ter = String(row.territory ?? '');
	if (ter) acc.uniqueTerritories.add(ter);

	const artist = String(row.artistName ?? '');
	if (artist) acc.uniqueArtists.add(artist);

	const sd = String(row.startDate ?? '');
	if (sd && (!acc.minStartDate || sd < acc.minStartDate))
		acc.minStartDate = sd;

	const ed = String(row.endDate ?? '');
	if (ed && (!acc.maxEndDate || ed > acc.maxEndDate)) acc.maxEndDate = ed;

	if (!acc.tenantName) acc.tenantName = String(row.tenant ?? '');
}

export interface GroupState {
	writer?: IStreamDetailWriter;
	summary: SummaryAccumulator;
	detailFilePath: string;
	hasWrittenDetailFile: boolean;
}

export function createStreamWriter(
	filePath: string,
	format: 'csv' | 'xlsx',
	append = false,
): IStreamDetailWriter {
	return format === 'csv'
		? new CsvStreamDetailWriter(filePath, append)
		: new XlsxStreamDetailWriter(filePath);
}
