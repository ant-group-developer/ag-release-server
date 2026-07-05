import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as readline from 'readline';
import * as zlib from 'zlib';
import { FactDspRow } from '../interfaces';
import { normalizeTextValue } from '../utils/fact-row-normalizer.util';

const AdmZip = require('adm-zip');

/**
 * Abstract base parser for all DSP data files.
 * Each DSP parser extends this and implements parseRow().
 */
export abstract class BaseParser {
	protected readonly logger: Logger;
	protected readonly dspId: string;

	constructor(dspId: string) {
		this.dspId = dspId;
		this.logger = new Logger(`${this.constructor.name}`);
	}

	/**
	 * Parse an entire file into standardized rows.
	 */
	async parseFile(filePath: string, batchId: string): Promise<FactDspRow[]> {
		const lowerPath = filePath.toLowerCase();

		// Handle .zip files: extract → parse inner files → cleanup
		if (lowerPath.endsWith('.zip')) {
			return this.parseZipFile(filePath, batchId);
		}

		return this.parseSingleFile(filePath, batchId);
	}

	/**
	 * Extract a .zip file, parse all data files inside, then cleanup.
	 */
	private async parseZipFile(
		zipPath: string,
		batchId: string,
	): Promise<FactDspRow[]> {
		const zip = new AdmZip(zipPath);
		const tempDir = path.join(
			os.tmpdir(),
			`etl-zip-${Date.now()}-${Math.random().toString(36).substring(7)}`,
		);

		try {
			zip.extractAllTo(tempDir, true);
			const extractedFiles = this.findExtractedDataFiles(tempDir);
			const allRows: FactDspRow[] = [];

			for (const extracted of extractedFiles) {
				const rows = await this.parseSingleFile(extracted, batchId);
				allRows.push(...rows);
			}

			return allRows;
		} finally {
			// Cleanup temp dir
			try {
				if (fs.existsSync(tempDir)) {
					fs.rmSync(tempDir, { recursive: true, force: true });
				}
			} catch {
				/* ignore cleanup errors */
			}
		}
	}

	/**
	 * Find data files in extracted zip directory.
	 */
	private findExtractedDataFiles(dir: string): string[] {
		const results: string[] = [];
		const entries = fs.readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				results.push(...this.findExtractedDataFiles(fullPath));
			} else {
				const name = entry.name.toLowerCase();
				if (
					name.endsWith('.csv') ||
					name.endsWith('.tsv') ||
					name.endsWith('.txt') ||
					name.endsWith('.csv.gz') ||
					name.endsWith('.tsv.gz') ||
					name.endsWith('.txt.gz')
				) {
					results.push(fullPath);
				}
			}
		}
		return results;
	}

	/**
	 * Parse a single flat file (csv/tsv/txt, optionally gzipped).
	 */
	private async parseSingleFile(
		filePath: string,
		batchId: string,
	): Promise<FactDspRow[]> {
		const rows: FactDspRow[] = [];
		const delimiter = this.getDelimiter(filePath);
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

		for await (const rawLine of rl) {
			lineNum++;
			const line = rawLine.trim();
			if (!line) continue;

			if (lineNum === 1) {
				headers = this.parseLine(line, delimiter);
				continue;
			}

			try {
				const values = this.parseLine(line, delimiter);
				if (values.length < headers.length * 0.5) continue;

				const record: Record<string, string> = {};
				headers.forEach((h, i) => {
					record[h.trim()] = (values[i] || '').trim();
				});

				const parsed = this.parseRow(record, batchId, filePath);
				if (parsed) {
					if (Array.isArray(parsed)) {
						rows.push(...parsed);
					} else {
						rows.push(parsed);
					}
				}
			} catch (err) {
				if (lineNum <= 5) {
					this.logger.warn(
						`Line ${lineNum} error in ${path.basename(filePath)}: ${err.message}`,
					);
				}
			}
		}

		return rows;
	}

	/**
	 * Transform a single record into FactDspRow(s).
	 * Return null to skip, or an array for 1-to-many mappings.
	 */
	protected abstract parseRow(
		record: Record<string, string>,
		batchId: string,
		filePath: string,
	): FactDspRow | FactDspRow[] | null;

	/**
	 * Determine file delimiter from extension/content.
	 */
	protected getDelimiter(filePath: string): string {
		// Strip .gz to get real extension (e.g. .tsv.gz → .tsv)
		const name = filePath.toLowerCase().replace(/\.gz$/, '');
		const ext = path.extname(name);
		if (ext === '.csv') return ',';
		if (ext === '.tsv') return '\t';
		if (ext === '.txt') return '\t'; // Most .txt files in this dataset are TSV
		return '\t';
	}

	/**
	 * Parse a delimited line, respecting quoted fields.
	 */
	protected parseLine(line: string, delimiter: string): string[] {
		const result: string[] = [];
		let current = '';
		let inQuotes = false;

		for (let i = 0; i < line.length; i++) {
			const char = line[i];
			if (char === '"') {
				if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
					current += '"';
					i++; // skip escaped quote
				} else {
					inQuotes = !inQuotes;
				}
			} else if (char === delimiter && !inQuotes) {
				result.push(current);
				current = '';
			} else {
				current += char;
			}
		}
		result.push(current);
		return result;
	}

	// ── Date Normalization Utilities ──────────────────────

	/**
	 * Normalize various date formats to ISO 'YYYY-MM-DD'.
	 */
	protected normalizeDate(dateStr: string): string {
		if (!dateStr) return '1970-01-01';

		const cleaned = dateStr.trim().replace(/"/g, '');

		// YYYY-MM-DD (already ISO)
		if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) {
			return cleaned.substring(0, 10);
		}

		// YYYYMMDD
		if (/^\d{8}$/.test(cleaned)) {
			return `${cleaned.substring(0, 4)}-${cleaned.substring(4, 6)}-${cleaned.substring(6, 8)}`;
		}

		// MM-YYYY or YYYY-MM
		const matchMonthYear = cleaned.match(/^(\d{1,2})-(\d{4})$/);
		if (matchMonthYear) {
			return `${matchMonthYear[2]}-${matchMonthYear[1].padStart(2, '0')}-01`;
		}
		const matchYearMonth = cleaned.match(/^(\d{4})-(\d{1,2})$/);
		if (matchYearMonth) {
			return `${matchYearMonth[1]}-${matchYearMonth[2].padStart(2, '0')}-01`;
		}

		// DD-MM-YYYY or DD/MM/YYYY
		const match1 = cleaned.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
		if (match1) {
			return `${match1[3]}-${match1[2]}-${match1[1]}`;
		}

		// MM/DD/YYYY or M/D/YYYY
		const match2 = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
		if (match2) {
			const monthStr = match2[1].padStart(2, '0');
			const dayStr = match2[2].padStart(2, '0');
			const month = parseInt(match2[1]);
			// If first part > 12, it's DD/MM/YYYY
			if (month > 12) {
				return `${match2[3]}-${dayStr}-${monthStr}`; // It was actually DD/MM/YYYY
			}
			return `${match2[3]}-${monthStr}-${dayStr}`;
		}

		this.logger.warn(`Unknown date format: "${dateStr}"`);
		return '1970-01-01';
	}

	/**
	 * Extract date from filename patterns:
	 *   - _2025-08-17_ (YYYY-MM-DD, e.g. MERLIN files)
	 *   - _20250817.   (YYYYMMDD, e.g. Daily files)
	 *   - _202506.     (YYYYMM only → first day of month)
	 */
	protected extractDateFromFilename(filename: string): string {
		const basename = path.basename(filename);

		// Try YYYY-MM-DD first (more specific, avoids matching random number suffixes)
		const matchIso = basename.match(/(\d{4})-(\d{2})-(\d{2})/);
		if (matchIso) {
			return `${matchIso[1]}-${matchIso[2]}-${matchIso[3]}`;
		}

		// Try YYYYMMDD with boundary: preceded by _ or - or start, followed by _ or - or . or end
		const matchCompact = basename.match(
			/(?:[_-]|^)(\d{4})(\d{2})(\d{2})(?:[_.\-]|$)/,
		);
		if (matchCompact) {
			const y = matchCompact[1],
				m = matchCompact[2],
				d = matchCompact[3];
			if (
				parseInt(m) >= 1 &&
				parseInt(m) <= 12 &&
				parseInt(d) >= 1 &&
				parseInt(d) <= 31
			) {
				return `${y}-${m}-${d}`;
			}
		}

		// Try YYYYMM (monthly reports) → use first day of month
		const matchMonth = basename.match(/(?:_|^)(\d{4})(\d{2})(?:[_.]|$)/);
		if (matchMonth) {
			const y = matchMonth[1],
				m = matchMonth[2];
			if (parseInt(m) >= 1 && parseInt(m) <= 12) {
				return `${y}-${m}-01`;
			}
		}

		return '1970-01-01';
	}

	// ── Country Code Normalization ────────────────────────

	/**
	 * Normalize territory/country code to ISO-2 uppercase.
	 */
	protected normalizeCountryCode(code: string): string {
		if (
			!code ||
			code === 'N/A' ||
			code === 'Unknown' ||
			code === '' ||
			code === 'ZZ'
		) {
			return 'N/A';
		}
		const cleaned = code.trim().toUpperCase();
		if (cleaned.length === 2 && /^[A-Z]{2}$/.test(cleaned)) {
			return cleaned;
		}
		return 'N/A';
	}

	protected normalizeText(value: string | null | undefined): string {
		return normalizeTextValue(value);
	}

	/**
	 * Safe parseInt with default fallback.
	 */
	protected safeInt(val: string, defaultVal = 0): number {
		if (!val || val === '' || val === 'N/A') return defaultVal;
		const parsed = parseInt(val, 10);
		return isNaN(parsed) ? defaultVal : Math.max(0, parsed);
	}

	/**
	 * Safe parseFloat with default fallback.
	 */
	protected safeFloat(val: string, defaultVal = 0): number {
		if (!val || val === '') return defaultVal;
		const parsed = parseFloat(val);
		return isNaN(parsed) ? defaultVal : parsed;
	}

	/**
	 * Create a base FactDspRow with defaults populated.
	 */
	protected createBaseRow(batchId: string): FactDspRow {
		return {
			reporting_period: '1970-01-01',
			dsp_id: this.dspId,
			partner_id: 'N/A',
			account_identifier: 'N/A',
			licensor: 'N/A',
			label_name: 'N/A',
			territory_code: 'N/A',
			isrc: 'N/A',
			upc: 'N/A',
			track_title: 'N/A',
			artist_name: 'N/A',
			album_title: 'N/A',
			composer_name: 'N/A',
			track_id_internal: 'N/A',
			quantity_total: 0,
			quantity_unique_users: 0,
			quantity_invalid: 0,
			usage_type: 'N/A',
			monetisation_type: 'N/A',
			track_classification: 'N/A',
			metadata: {},
			source_category: 'N/A',
			batch_id: batchId,
			import_source: '',
			source_file_name: '',
		};
	}
}
