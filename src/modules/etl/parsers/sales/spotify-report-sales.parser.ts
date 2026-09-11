import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import * as zlib from 'zlib';
import { FactSalesRow } from '../../interfaces';
import { BaseSalesParser } from './base-sales.parser';

export interface SpotifyReportStreamingOpts {
	batchSize?: number;
	memberName: string;
}

export interface SpotifyReportStreamingResult {
	totalRows: number;
	skippedRows: number;
}

export class SpotifyReportSalesParser extends BaseSalesParser {
	private periodStart = '1970-01-01';
	private periodEnd = '1970-01-01';
	private recipient = 'ANT MUSIC LLC';

	constructor() {
		super('spotify-report');
		this.skipHeaderRows = 2; // Format version (line 1) + metadata (line 2)
	}

	/**
	 * Parse the metadata line (line 2) to get reporting start/end date and recipient.
	 */
	protected onSkippedHeaderRow(
		lineNum: number,
		line: string,
		_filePath: string,
	): void {
		if (lineNum === 2) {
			const parts = this.parseLine(line, '\t');
			if (parts[1] && /^\d{4}-\d{2}-\d{2}/.test(parts[1])) {
				this.periodStart = parts[1].trim();
			}
			if (parts[2] && /^\d{4}-\d{2}-\d{2}/.test(parts[2])) {
				this.periodEnd = parts[2].trim();
			}
			if (parts[4]) {
				this.recipient = parts[4].trim();
			}
		}
	}

	private extractPeriodFromFilename(
		filename: string,
		isStart: boolean,
	): string {
		const match = filename.toLowerCase().match(/(\d{6})/);
		if (match) {
			const y = match[1].substring(0, 4);
			const m = match[1].substring(4, 6);
			if (isStart) return `${y}-${m}-01`;
			const lastDay = new Date(
				parseInt(y, 10),
				parseInt(m, 10),
				0,
			).getDate();
			return `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
		}
		return isStart ? this.periodStart : this.periodEnd;
	}

	protected parseRow(
		r: Record<string, string>,
		batchId: string,
		filePath: string,
	): FactSalesRow | null {
		const isrc = r['ISRC'] || '';
		if (!isrc) return null;

		const row = this.createBaseRow(batchId);
		const filename = path.basename(filePath);

		row.reporting_period_start =
			this.periodStart !== '1970-01-01'
				? this.periodStart
				: this.extractPeriodFromFilename(filename, true);
		row.reporting_period_end =
			this.periodEnd !== '1970-01-01'
				? this.periodEnd
				: this.extractPeriodFromFilename(filename, false);

		row.service_name = 'Spotify';
		row.dpid = 'N/A';
		row.member_name = this.recipient || 'ANT MUSIC LLC';
		row.label_name = r['Label'] || 'N/A';
		row.territory_code = this.normalizeCountryCode(r['Country'] || '');
		row.isrc = isrc;
		row.upc = r['UPC'] || '';
		row.track_title = r['Track Name'] || '';
		row.artist_name = r['Artist Name'] || '';
		row.composer_name = r['Composer Name'] || '';
		row.album_title = r['Album Name'] || '';

		row.quantity = this.safeInt(r['Quantity'] || '0');

		// Revenue
		const rawLocal = r['Payable (Reporting)'] || '0';
		const localCurrency = r['Reporting Currency'] || 'USD';
		row.revenue_currency = localCurrency;
		row.revenue_local = this.safeDecimal(rawLocal);

		// Direct USD mapping
		const rawUsd = r['Payable USD'] || '';
		if (rawUsd) {
			row.revenue_usd = this.safeDecimal(rawUsd);
		} else if (localCurrency.toUpperCase() === 'USD') {
			row.revenue_usd = row.revenue_local;
		} else {
			row.revenue_usd = '0';
		}

		row.service_tier = r['Product'] || '';
		row.usage_type = 'streaming';
		row.source_category = 'sales';

		const meta: Record<string, string> = {};
		if (r['URI']) meta.spotify_uri = r['URI'];
		if (r['Noise Content']) meta.noise_content = r['Noise Content'];
		if (r['Payable EUR']) meta.payable_eur = r['Payable EUR'];
		if (r['Payable (Invoice)'])
			meta.payable_invoice = r['Payable (Invoice)'];
		if (r['Invoice Currency'])
			meta.invoice_currency = r['Invoice Currency'];

		if (Object.keys(meta).length > 0) {
			row.metadata = meta;
		}

		return row;
	}

	async parseFileStreaming(
		filePath: string,
		batchId: string,
		onBatch: (rows: FactSalesRow[]) => Promise<void>,
		opts: SpotifyReportStreamingOpts,
	): Promise<SpotifyReportStreamingResult> {
		const batchSize = opts.batchSize ?? 50_000;
		const isGzipped = filePath.toLowerCase().endsWith('.gz');

		let inputStream: NodeJS.ReadableStream;
		if (isGzipped) {
			const rawStream = fs.createReadStream(filePath);
			const gunzip = zlib.createGunzip();
			inputStream = rawStream.pipe(gunzip);
			inputStream.setEncoding('utf-8');
		} else {
			inputStream = fs.createReadStream(filePath, { encoding: 'utf-8' });
		}

		const rl = readline.createInterface({
			input: inputStream,
			crlfDelay: Infinity,
		});

		let headers: string[] = [];
		let lineNum = 0;
		let buffer: FactSalesRow[] = [];
		let totalRows = 0;
		let skippedRows = 0;
		let warnCount = 0;

		const delimiter = '\t';
		const headerLine = this.skipHeaderRows + 1; // 3

		for await (const rawLine of rl) {
			lineNum++;
			const line = rawLine.trim();
			if (!line) continue;

			if (lineNum < headerLine) {
				this.onSkippedHeaderRow(lineNum, line, filePath);
				continue;
			}

			if (lineNum === headerLine) {
				headers = this.parseLine(line, delimiter);
				continue;
			}

			try {
				const values = this.parseLine(line, delimiter);
				if (values.length < headers.length * 0.3) {
					skippedRows++;
					continue;
				}

				const record: Record<string, string> = {};
				headers.forEach((h, i) => {
					record[h.trim()] = (values[i] || '').trim();
				});

				const parsed = this.parseRow(record, batchId, filePath);

				if (!parsed) {
					skippedRows++;
					continue;
				}

				this.normalizeParsedRows([parsed]);
				buffer.push(parsed);
				totalRows++;
			} catch (err) {
				skippedRows++;
				if (warnCount < 3) {
					this.logger.warn(
						`Line ${lineNum} parse error: ${err.message}`,
					);
					warnCount++;
				}
			}
			if (buffer.length >= batchSize) {
				await onBatch(buffer);
				buffer = [];
			}
		}

		if (buffer.length > 0) {
			await onBatch(buffer);
			buffer = [];
		}

		return { totalRows, skippedRows };
	}
}
