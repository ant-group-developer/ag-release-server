import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as readline from 'readline';
import * as zlib from 'zlib';
import { FactSalesRow } from '../../interfaces';
import {
	normalizeFactRows,
	normalizeTextValue,
} from '../../utils/fact-row-normalizer.util';
import { ParseFileStats } from '../base.parser';
import {
	applyInputAliases,
	ConfiguredFieldMapping,
	readSourceValue,
	suppressSkippedInputColumns,
	transformMappedValue,
} from '../field-mapping-overlay';

const AdmZip = require('adm-zip');

/**
 * Abstract base parser for all DSP sales data files.
 * Produces FactSalesRow[] instead of FactDspRow[].
 */
export abstract class BaseSalesParser {
	protected readonly logger: Logger;
	protected readonly dspId: string;
	private fieldMappingOverrides: ConfiguredFieldMapping[] = [];
	private catalogMappings: ConfiguredFieldMapping[] = [];

	/** Number of header rows to skip before the actual column header (default 0). */
	protected skipHeaderRows = 0;

	constructor(dspId: string) {
		this.dspId = dspId;
		this.logger = new Logger(`${this.constructor.name}`);
	}

	/** Apply database mappings without replacing DSP-specific parser behaviour. */
	setFieldMappingOverrides(mappings: ConfiguredFieldMapping[]): this {
		this.fieldMappingOverrides = mappings;
		return this;
	}

	/**
	 * Catalog base mappings (hardcoded parser assignments stored in DB with
	 * mapping_scope='catalog'). Used at runtime to detect which targetColumn
	 * parseRow hardcoded for a given source column, so a DB override that
	 * redirects that source to a different targetColumn can suppress the
	 * hardcoded field.
	 */
	setCatalogMappings(mappings: ConfiguredFieldMapping[]): this {
		this.catalogMappings = mappings;
		return this;
	}

	protected prepareRecord(record: Record<string, string>): void {
		applyInputAliases(record, this.fieldMappingOverrides);
		suppressSkippedInputColumns(record, this.fieldMappingOverrides);
	}

	/**
	 * Parse an entire file into standardized sales rows.
	 */
	async parseFile(
		filePath: string,
		batchId: string,
	): Promise<FactSalesRow[]> {
		const lowerPath = filePath.toLowerCase();

		if (lowerPath.endsWith('.zip')) {
			return this.parseZipFile(filePath, batchId);
		}

		return this.parseSingleFile(filePath, batchId);
	}

	/**
	 * Parse a sales file with the same result shape as BaseParser.
	 * ImportService uses this to retain per-file ETL audit information for every
	 * category, including sales.
	 */
	async parseFileWithStats(
		filePath: string,
		batchId: string,
	): Promise<{ rows: FactSalesRow[]; stats: ParseFileStats }> {
		const lowerPath = filePath.toLowerCase();
		if (lowerPath.endsWith('.zip')) {
			return this.parseZipFileWithStats(filePath, batchId);
		}
		return this.parseSingleFileWithStats(filePath, batchId);
	}

	private async parseZipFileWithStats(
		zipPath: string,
		batchId: string,
	): Promise<{ rows: FactSalesRow[]; stats: ParseFileStats }> {
		const zip = new AdmZip(zipPath);
		const tempDir = path.join(
			os.tmpdir(),
			`etl-sales-zip-${Date.now()}-${Math.random().toString(36).substring(7)}`,
		);
		let zipSize = 0;
		try {
			zipSize = fs.statSync(zipPath).size;
		} catch {}
		try {
			zip.extractAllTo(tempDir, true);
			const extractedFiles = this.findExtractedDataFiles(tempDir);
			if (extractedFiles.length === 0) {
				return {
					rows: [],
					stats: {
						filePath: zipPath,
						fileName: path.basename(zipPath),
						fileDirectory: path.dirname(zipPath),
						fileSizeBytes: zipSize,
						totalLines: 0,
						processedRows: 0,
						skippedRows: 0,
						errorRows: 0,
					},
				};
			}
			let totalLines = 0;
			let skippedRows = 0;
			let errorRows = 0;
			const allRows: FactSalesRow[] = [];
			for (const extracted of extractedFiles) {
				const { rows, stats } = await this.parseSingleFileWithStats(
					extracted,
					batchId,
				);
				totalLines += stats.totalLines;
				skippedRows += stats.skippedRows;
				errorRows += stats.errorRows;
				allRows.push(...rows);
			}
			return {
				rows: allRows,
				stats: {
					filePath: zipPath,
					fileName: path.basename(zipPath),
					fileDirectory: path.dirname(zipPath),
					fileSizeBytes: zipSize,
					totalLines,
					processedRows: allRows.length,
					skippedRows,
					errorRows,
				},
			};
		} finally {
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
	 * Extract a .zip, parse all data files inside, then cleanup.
	 */
	private async parseZipFile(
		zipPath: string,
		batchId: string,
	): Promise<FactSalesRow[]> {
		const zip = new AdmZip(zipPath);
		const tempDir = path.join(
			os.tmpdir(),
			`etl-sales-zip-${Date.now()}-${Math.random().toString(36).substring(7)}`,
		);

		try {
			zip.extractAllTo(tempDir, true);
			const extractedFiles = this.findExtractedDataFiles(tempDir);
			const allRows: FactSalesRow[] = [];

			for (const extracted of extractedFiles) {
				const rows = await this.parseSingleFile(extracted, batchId);
				allRows.push(...rows);
			}

			return allRows;
		} finally {
			try {
				if (fs.existsSync(tempDir)) {
					fs.rmSync(tempDir, { recursive: true, force: true });
				}
			} catch {
				/* ignore cleanup errors */
			}
		}
	}

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
	 * Parse a single flat file.
	 */
	private async parseSingleFile(
		filePath: string,
		batchId: string,
	): Promise<FactSalesRow[]> {
		const { rows } = await this.parseSingleFileWithStats(filePath, batchId);
		return rows;
	}

	private async parseSingleFileWithStats(
		filePath: string,
		batchId: string,
	): Promise<{ rows: FactSalesRow[]; stats: ParseFileStats }> {
		const rows: FactSalesRow[] = [];
		let delimiter = this.getDelimiter(filePath);
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
		let skippedRows = 0;
		let errorRows = 0;
		const headerLine = this.skipHeaderRows + 1;

		for await (const rawLine of rl) {
			lineNum++;
			const line = rawLine.trim();
			if (!line) continue;

			if (lineNum < headerLine) {
				this.onSkippedHeaderRow(lineNum, line, filePath);
				continue;
			}

			if (lineNum === headerLine) {
				const tabCount = (line.match(/\t/g) || []).length;
				const commaCount = (line.match(/,/g) || []).length;
				if (tabCount > commaCount && tabCount > 3) delimiter = '\t';
				else if (commaCount > tabCount && commaCount > 3)
					delimiter = ',';

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
				this.prepareRecord(record);

				const parsed = this.parseRow(record, batchId, filePath);
				if (parsed) {
					if (Array.isArray(parsed)) {
						rows.push(
							...this.normalizeParsedRows(
								parsed.map((row) =>
									this.applyFieldMappingOverrides(
										row,
										record,
									),
								),
							),
						);
					} else {
						rows.push(
							...this.normalizeParsedRows([
								this.applyFieldMappingOverrides(parsed, record),
							]),
						);
					}
				} else {
					skippedRows++;
				}
			} catch (err) {
				errorRows++;
				if (lineNum <= headerLine + 3) {
					this.logger.warn(
						`Line ${lineNum} error in ${path.basename(filePath)}: ${err.message}`,
					);
				}
			}
		}

		const stats: ParseFileStats = {
			filePath,
			fileName: path.basename(filePath),
			fileDirectory: path.dirname(filePath),
			fileSizeBytes: (() => {
				try {
					return fs.statSync(filePath).size;
				} catch {
					return 0;
				}
			})(),
			totalLines: lineNum,
			processedRows: rows.length,
			skippedRows,
			errorRows,
		};

		return { rows, stats };
	}

	/**
	 * Called for each skipped header row. Override to extract metadata (e.g. Pandora CommercialModelType).
	 */

	protected onSkippedHeaderRow(
		_lineNum: number,
		_line: string,
		_filePath: string,
	): void {
		// Default: do nothing
	}

	/**
	 * Transform a single record into FactSalesRow(s).
	 */
	protected abstract parseRow(
		record: Record<string, string>,
		batchId: string,
		filePath: string,
	): FactSalesRow | FactSalesRow[] | null;

	private applyFieldMappingOverrides(
		row: FactSalesRow,
		record: Record<string, string>,
	): FactSalesRow {
		this.suppressRedirectedHardcodedTargets(row);
		for (const mapping of this.fieldMappingOverrides) {
			if (mapping.targetColumn === 'skip') continue;
			const value = transformMappedValue(
				readSourceValue(record, mapping.reportColumn),
				mapping.transform,
			);
			if (mapping.targetColumn.startsWith('metadata.')) {
				row.metadata[mapping.targetColumn.slice('metadata.'.length)] =
					value;
				continue;
			}
			const target = mapping.targetColumn as keyof FactSalesRow;
			if (
				['quantity', 'quantity_creations', 'quantity_views'].includes(
					mapping.targetColumn,
				)
			) {
				(row as unknown as Record<string, unknown>)[target] =
					this.safeInt(value);
			} else if (
				['revenue_usd', 'revenue_local'].includes(mapping.targetColumn)
			) {
				(row as unknown as Record<string, unknown>)[target] =
					this.safeDecimal(value);
			} else if (
				mapping.targetColumn === 'reporting_period_start' ||
				mapping.targetColumn === 'reporting_period_end'
			) {
				(row as unknown as Record<string, unknown>)[target] =
					this.normalizeDate(
						value,
						mapping.targetColumn === 'reporting_period_start',
					);
			} else if (mapping.targetColumn === 'territory_code') {
				(row as unknown as Record<string, unknown>)[target] =
					this.normalizeCountryCode(value);
			} else {
				(row as unknown as Record<string, unknown>)[target] = value;
			}
		}
		return row;
	}

	/**
	 * Delete the hardcoded targetColumn that parseRow set when a DB override
	 * redirects the same reportColumn to a different targetColumn. Without
	 * this, the row would carry both the hardcoded field and the override
	 * field — duplicate data.
	 */
	private suppressRedirectedHardcodedTargets(row: FactSalesRow): void {
		if (!this.catalogMappings.length) return;
		const suppressedTargets = new Set<string>();
		for (const cat of this.catalogMappings) {
			if (cat.targetColumn === 'skip') continue;
			const redirected = this.fieldMappingOverrides.some(
				(m) =>
					m.targetColumn !== 'skip' &&
					m.targetColumn !== cat.targetColumn &&
					m.reportColumn === cat.reportColumn,
			);
			if (redirected) suppressedTargets.add(cat.targetColumn);
		}
		for (const target of suppressedTargets) {
			if (target.startsWith('metadata.')) {
				delete row.metadata[target.slice('metadata.'.length)];
			} else {
				delete (row as unknown as Record<string, unknown>)[target];
			}
		}
	}

	protected normalizeParsedRows(rows: FactSalesRow[]): FactSalesRow[] {
		return normalizeFactRows(rows);
	}

	// ── Delimiter & line parsing (same as BaseParser) ──

	protected getDelimiter(filePath: string): string {
		const name = filePath.toLowerCase().replace(/\.gz$/, '');
		const ext = path.extname(name);
		if (ext === '.csv') return ',';
		if (ext === '.tsv') return '\t';
		if (ext === '.txt') return '\t';
		return '\t';
	}

	protected parseLine(line: string, delimiter: string): string[] {
		const result: string[] = [];
		let current = '';
		let inQuotes = false;

		for (let i = 0; i < line.length; i++) {
			const char = line[i];
			if (char === '"') {
				if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
					current += '"';
					i++;
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

	// ── Shared utilities ──

	protected normalizeDate(
		dateStr: string,
		isStart = true,
		format?: 'DMY' | 'MDY',
	): string {
		if (!dateStr) return '1970-01-01';
		const cleaned = dateStr.trim().replace(/"/g, '');

		// YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS or YYYY-MM-DDTHH:MM:SSUTC
		if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) return cleaned.substring(0, 10);
		// YYYYMMDD
		if (/^\d{8}$/.test(cleaned))
			return `${cleaned.substring(0, 4)}-${cleaned.substring(4, 6)}-${cleaned.substring(6, 8)}`;
		// YYYYMMDD-YYYYMMDD (range format, e.g. Tencent "20230101-20230131" or "20230101 - 20230131")
		const mRange = cleaned.match(/^(\d{8})\s*-\s*(\d{8})$/);
		if (mRange) {
			const part = isStart ? mRange[1] : mRange[2];
			return `${part.substring(0, 4)}-${part.substring(4, 6)}-${part.substring(6, 8)}`;
		}
		// DD-MM-YYYY or DD/MM/YYYY or MM/DD/YYYY
		const m1 = cleaned.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
		if (m1) {
			const p1 = parseInt(m1[1], 10);
			const p2 = parseInt(m1[2], 10);
			if (p1 > 12) {
				// Must be DD/MM/YYYY
				return `${m1[3]}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`;
			} else if (p2 > 12) {
				// Must be MM/DD/YYYY
				return `${m1[3]}-${m1[1].padStart(2, '0')}-${m1[2].padStart(2, '0')}`;
			}
			// Ambiguous case (both p1 and p2 <= 12)
			if (format === 'DMY') {
				return `${m1[3]}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`;
			} else if (format === 'MDY') {
				return `${m1[3]}-${m1[1].padStart(2, '0')}-${m1[2].padStart(2, '0')}`;
			}
			// Ambiguous, assume MM/DD/YYYY as many DSPs are US-based (Saavn uses MM/DD/YYYY)
			return `${m1[3]}-${m1[1].padStart(2, '0')}-${m1[2].padStart(2, '0')}`;
		}
		// YYYY/M/D or YYYY/MM/DD
		const m2 = cleaned.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
		if (m2)
			return `${m2[1]}-${m2[2].padStart(2, '0')}-${m2[3].padStart(2, '0')}`;
		// MM-YYYY (monthly, e.g. SoundCloud "08-2025")
		const m3 = cleaned.match(/^(\d{2})-(\d{4})$/);
		if (m3) return `${m3[2]}-${m3[1]}-01`;

		this.logger.warn(`Unknown date format: "${dateStr}"`);
		return '1970-01-01';
	}

	protected normalizeCountryCode(code: string): string {
		if (
			!code ||
			code === 'N/A' ||
			code === 'Unknown' ||
			code === '' ||
			code === 'ZZ'
		)
			return 'N/A';
		const cleaned = code.trim().toUpperCase();
		if (cleaned.length === 2 && /^[A-Z]{2}$/.test(cleaned)) return cleaned;
		return 'N/A';
	}

	protected normalizeText(value: string | null | undefined): string {
		return normalizeTextValue(value);
	}

	protected safeInt(val: string, defaultVal = 0): number {
		if (!val || val === '' || val === 'N/A') return defaultVal;
		// Handle float strings like "1.0"
		const parsed = parseFloat(val);
		return isNaN(parsed) ? defaultVal : Math.max(0, Math.round(parsed));
	}

	protected safeFloat(val: string, defaultVal = 0): number {
		if (!val || val === '' || val === 'N/A') return defaultVal;
		const parsed = parseFloat(val);
		return isNaN(parsed) ? defaultVal : parsed;
	}

	/**
	 * Preserve exact decimal string for Decimal128 columns.
	 * Returns the raw string value if it's a valid number, otherwise '0'.
	 */
	protected safeDecimal(val: string, defaultVal = '0'): string {
		if (!val || val === '' || val === 'N/A') return defaultVal;
		const cleaned = val.trim();
		if (isNaN(Number(cleaned))) return defaultVal;
		return cleaned;
	}

	protected createBaseRow(batchId: string): FactSalesRow {
		return {
			reporting_period_start: '1970-01-01',
			reporting_period_end: '1970-01-01',
			dsp_id: this.dspId,
			service_name: 'N/A',
			dpid: 'N/A',
			member_name: 'N/A',
			label_name: 'N/A',
			territory_code: 'N/A',
			isrc: 'N/A',
			upc: 'N/A',
			grid: 'N/A',
			release_id: 'N/A',
			track_title: 'N/A',
			artist_name: 'N/A',
			album_title: 'N/A',
			composer_name: 'N/A',
			genre: 'N/A',
			quantity: 0,
			quantity_creations: 0,
			quantity_views: 0,
			revenue_usd: '0',
			revenue_local: '0',
			revenue_currency: 'USD',
			usage_type: 'N/A',
			monetisation_type: 'N/A',
			service_tier: 'N/A',
			plan_name: 'N/A',
			commercial_model: 'N/A',
			metadata: {},
			source_category: 'sales',
			batch_id: batchId,
			import_source: '',
			source_file_name: '',
			ingest_tenant_id: '',
			ingest_label_id: '',
		};
	}
}
