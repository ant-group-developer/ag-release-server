import * as fs from 'fs';
import * as readline from 'readline';
import {
	normalizeReportUpcOrFallback,
	normalizeStandardUpcOrEmpty,
} from 'src/utils/upc.util';
import { FactSalesRow } from '../../interfaces';
import { BaseSalesParser } from './base-sales.parser';

export interface WmgStreamingOpts {
	batchSize?: number;
	resolveDspId: (dspName: string) => Promise<string>;
	revenueCurrency: string;
	memberName: string;
}

export interface WmgStreamingResult {
	totalRows: number;
	uniqueDsps: Set<string>;
	skippedRows: number;
}

export class WmgSalesParser extends BaseSalesParser {
	constructor() {
		super('wmg-pending');
	}

	/** Strip Excel formula wrapper: ="123.45" → 123.45, ="0085365572676" → 0085365572676 */
	private cleanExcelQuoted(val: string): string {
		if (!val) return '';
		let s = val.trim();
		if (s.startsWith('=')) s = s.substring(1);
		if (s.startsWith('"') && s.endsWith('"')) s = s.slice(1, -1);
		return s.trim();
	}

	/** YYYY-MM → { start: YYYY-MM-01, end: YYYY-MM-DD (last day) } */
	private monthToRange(month: string): { start: string; end: string } {
		const cleaned = this.cleanExcelQuoted(month);
		const m = cleaned.match(/^(\d{4})-(\d{2})$/);
		if (!m) return { start: '1970-01-01', end: '1970-01-01' };
		const year = parseInt(m[1], 10);
		const mo = parseInt(m[2], 10);
		const lastDay = new Date(year, mo, 0).getDate();
		return {
			start: `${m[1]}-${m[2]}-01`,
			end: `${m[1]}-${m[2]}-${String(lastDay).padStart(2, '0')}`,
		};
	}

	private async parseRowAsync(
		record: Record<string, string>,
		batchId: string,
		opts: WmgStreamingOpts,
	): Promise<FactSalesRow | null> {
		const isrcRaw = this.cleanExcelQuoted(record['ISRC'] || '')
			.trim()
			.toUpperCase();
		const isAlbumLevel = !isrcRaw;
		const rawGpid = this.cleanExcelQuoted(record['GPID'] || '');
		const upc = isAlbumLevel
			? normalizeStandardUpcOrEmpty(rawGpid)
			: normalizeReportUpcOrFallback(rawGpid, isrcRaw);
		if (!upc) return null;

		const dspName = (record['Digital Service Provider(DSP)'] || '').trim();
		if (!dspName) return null;

		const dspId = await opts.resolveDspId(dspName);

		const isrc = isAlbumLevel ? `UPC-${upc}` : isrcRaw;

		const { start, end } = this.monthToRange(
			record['Recdate Month ID'] || '',
		);

		const royaltyGross = this.cleanExcelQuoted(
			record['Royalty Payable'] || '0',
		);
		const deductibleFees = this.cleanExcelQuoted(
			record['Deductible Fees'] || '0',
		);
		const netRoyalty = this.cleanExcelQuoted(
			record['Net Royalty Payable'] || '0',
		);
		const saleUnits = this.cleanExcelQuoted(record['Sale Units'] || '0');

		const accountName = (record['Account Name'] || '').trim();
		const payee = (record['Payee'] || '').trim();
		const productTitle = this.normalizeText(record['Product Title']);
		const projectTitle = this.normalizeText(record['Project Title']);

		const row = this.createBaseRow(batchId);
		row.dsp_id = dspId;
		row.reporting_period_start = start;
		row.reporting_period_end = end;
		row.service_name = dspName;
		row.member_name = this.normalizeText(
			accountName || payee || opts.memberName,
		);
		row.territory_code = this.normalizeCountryCode(record['Country'] || '');
		row.isrc = isrc;
		row.upc = upc;
		row.track_title = projectTitle;
		row.album_title = productTitle;
		row.artist_name = this.normalizeText(record['Artist Name']);
		row.quantity = this.safeInt(saleUnits);
		row.revenue_local = this.safeDecimal(netRoyalty);
		row.revenue_usd = '0';
		row.revenue_currency = opts.revenueCurrency;
		row.usage_type = this.normalizeText(record['Config Type']);
		row.source_category = 'sales';
		row.metadata = {
			is_album_level: String(isAlbumLevel),
			recdate_month: this.cleanExcelQuoted(
				record['Recdate Month ID'] || '',
			),
			repdate_month: this.cleanExcelQuoted(
				record['Repdate Month ID'] || '',
			),
			project_title: projectTitle,
			catalog_number: this.cleanExcelQuoted(
				record['Catalog Number'] || '',
			),
			config: (record['Config'] || '').trim(),
			config_desc: (record['Config Desc'] || '').trim(),
			account: (record['Account'] || '').trim(),
			account_name: accountName,
			payee,
			price_code: (record['Price Code'] || '').trim(),
			price_desc: (record['Price Desc'] || '').trim(),
			dist_chan_code: (record['Dist. Ch.'] || '').trim(),
			dist_chan_desc: (record['Dist Chan Desc'] || '').trim(),
			local_product_number: this.cleanExcelQuoted(
				record['Local Product Number'] || '',
			),
			marketing_owner: (record['Marketing Owner'] || '').trim(),
			royalty_payable_gross: royaltyGross,
			deductible_fees: deductibleFees,
		};

		return row;
	}

	/**
	 * Stream-parse a WMG CSV file, flushing rows to ClickHouse every batchSize rows.
	 * Memory cap: ~30-50 MB regardless of file size (only 1 batch in heap at a time).
	 */
	async parseFileStreaming(
		filePath: string,
		batchId: string,
		onBatch: (rows: FactSalesRow[]) => Promise<void>,
		opts: WmgStreamingOpts,
	): Promise<WmgStreamingResult> {
		const batchSize = opts.batchSize ?? 50_000;
		const inputStream = fs.createReadStream(filePath, {
			encoding: 'utf-8',
		});
		const rl = readline.createInterface({
			input: inputStream,
			crlfDelay: Infinity,
		});

		let headers: string[] = [];
		let lineNum = 0;
		let buffer: FactSalesRow[] = [];
		const uniqueDsps = new Set<string>();
		let totalRows = 0;
		let skippedRows = 0;
		let warnCount = 0;

		for await (const rawLine of rl) {
			lineNum++;
			const line = rawLine.trim();
			if (!line) continue;

			if (lineNum === 1) {
				headers = this.parseLine(line, ',');
				continue;
			}

			try {
				const values = this.parseLine(line, ',');
				if (values.length < headers.length * 0.3) {
					skippedRows++;
					continue;
				}

				const record: Record<string, string> = {};
				headers.forEach((h, i) => {
					record[h.trim()] = (values[i] || '').trim();
				});

				const dspName = (
					record['Digital Service Provider(DSP)'] || ''
				).trim();
				const parsed = await this.parseRowAsync(record, batchId, opts);

				if (!parsed) {
					skippedRows++;
					continue;
				}

				this.normalizeParsedRows([parsed]);
				buffer.push(parsed);
				totalRows++;
				if (dspName) uniqueDsps.add(dspName);
			} catch (err) {
				skippedRows++;
				if (warnCount < 3) {
					this.logger.warn(
						`Line ${lineNum} parse error: ${err.message}`,
					);
					warnCount++;
				}
			}
			// Storage errors must abort the import, not be treated as row errors.
			if (buffer.length >= batchSize) {
				await onBatch(buffer);
				buffer = [];
			}
		}

		// Flush remaining rows
		if (buffer.length > 0) {
			await onBatch(buffer);
			buffer = [];
		}

		return { totalRows, uniqueDsps, skippedRows };
	}

	// Required by BaseSalesParser — not used in streaming flow but must be implemented
	protected parseRow(
		_record: Record<string, string>,
		_batchId: string,
		_filePath: string,
	): FactSalesRow | null {
		return null;
	}
}
