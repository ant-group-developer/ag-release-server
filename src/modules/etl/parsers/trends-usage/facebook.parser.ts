import * as fs from 'fs';
import * as path from 'path';
import { FactDspRow } from '../../interfaces';
import { BaseParser } from '../base.parser';

const AdmZip = require('adm-zip');

export class FacebookParser extends BaseParser {
	constructor() {
		super('facebook');
	}

	private processedFolders = new Set<string>();

	async parseFile(filePath: string, batchId: string): Promise<FactDspRow[]> {
		const basename = path.basename(filePath);

		// Usage-Report files (usage/ folder) → use base class parsing (handles zip too)
		if (basename.includes('Usage-Report')) {
			return super.parseFile(filePath, batchId);
		}

		// Trends files → folder-level merge (process once per folder)
		const folder = path.dirname(filePath);
		const folderKey = folder + batchId;

		if (this.processedFolders.has(folderKey)) {
			return [];
		}
		this.processedFolders.add(folderKey);

		// Check if folder has .zip files — if so, extract all to temp, parse there
		const folderEntries = fs.readdirSync(folder);
		const hasZips = folderEntries.some((f) =>
			f.toLowerCase().endsWith('.zip'),
		);

		if (hasZips) {
			return this.extractAndParseFolder(folder, batchId);
		}

		return this.parseFolder(folder, batchId);
	}

	/**
	 * Extract ALL zip files in a folder to in-memory map, then run merge logic.
	 * Avoids temp dir filesystem issues in Docker.
	 */
	private async extractAndParseFolder(
		folder: string,
		batchId: string,
	): Promise<FactDspRow[]> {
		// Map: filename → file content (string)
		const fileContents = new Map<string, string>();

		const entries = fs.readdirSync(folder);
		let extractedCount = 0;
		let failedCount = 0;

		for (const entry of entries) {
			const fullPath = path.join(folder, entry);
			const lower = entry.toLowerCase();

			if (lower.endsWith('.zip')) {
				try {
					const zip = new AdmZip(fullPath);
					const zipEntries = zip.getEntries();
					for (const ze of zipEntries) {
						if (ze.isDirectory) continue;
						const content = ze.getData();
						const flatName = path.basename(ze.entryName);
						if (!flatName) continue;
						fileContents.set(flatName, content.toString('utf-8'));
					}
					extractedCount++;
				} catch (err) {
					this.logger.warn(
						`Failed to extract ${entry}: ${err.message}`,
					);
					failedCount++;
				}
			} else if (
				lower.endsWith('.csv') ||
				lower.endsWith('.tsv') ||
				lower.endsWith('.txt')
			) {
				try {
					fileContents.set(entry, fs.readFileSync(fullPath, 'utf-8'));
					extractedCount++;
				} catch (err) {
					this.logger.warn(`Failed to read ${entry}: ${err.message}`);
				}
			}
		}

		this.logger.log(
			`Facebook zip extract: ${extractedCount} ok, ${failedCount} failed → ${fileContents.size} files in memory`,
		);

		return this.parseFolderFromMemory(fileContents, batchId);
	}

	/**
	 * Parse all FB files from in-memory map, merging and deduplicating.
	 */
	private async parseFolderFromMemory(
		fileContents: Map<string, string>,
		batchId: string,
	): Promise<FactDspRow[]> {
		const allFiles = Array.from(fileContents.keys());

		const merlinFiles = allFiles.filter((f) =>
			f.includes('MERLIN_DAILY_TOP_1K'),
		);
		const dailyFiles = allFiles.filter(
			(f) =>
				f.includes('Daily_consumption') ||
				f.includes('Daily_production'),
		);

		this.logger.log(
			`Facebook merge: ${merlinFiles.length} MERLIN files + ${dailyFiles.length} Daily files`,
		);

		// Step 1: Parse MERLIN files (primary — rich data)
		const merlinRows = new Map<string, FactDspRow>();
		for (const file of merlinFiles) {
			try {
				const content = fileContents.get(file)!;
				const rows = this.parseMerlinContent(content, file, batchId);
				for (const row of rows) {
					const key = this.dedupeKey(row);
					if (!merlinRows.has(key)) {
						merlinRows.set(key, row);
					} else {
						merlinRows.get(key)!.quantity_total +=
							row.quantity_total;
					}
				}
			} catch (err) {
				this.logger.warn(
					`Error parsing MERLIN ${file}: ${err.message}`,
				);
			}
		}

		// Step 2: Parse Daily files — collect UPC lookup + extra rows
		const dailyRows = new Map<string, FactDspRow>();
		const upcLookup = new Map<string, string>(); // isrc → upc

		for (const file of dailyFiles) {
			try {
				const content = fileContents.get(file)!;
				const rows = this.parseDailyContent(content, file, batchId);
				for (const row of rows) {
					if (row.upc) {
						upcLookup.set(row.isrc, row.upc);
					}
					const key = this.dedupeKey(row);
					if (!dailyRows.has(key)) {
						dailyRows.set(key, row);
					} else {
						dailyRows.get(key)!.quantity_total +=
							row.quantity_total;
					}
				}
			} catch (err) {
				this.logger.warn(`Error parsing Daily ${file}: ${err.message}`);
			}
		}

		// Step 3: Merge — enrich MERLIN rows with UPC, add Daily-only rows
		const finalRows: FactDspRow[] = [];

		// Add all MERLIN rows (enriched with UPC)
		for (const [key, row] of merlinRows) {
			if (!row.upc && upcLookup.has(row.isrc)) {
				row.upc = upcLookup.get(row.isrc)!;
			}
			finalRows.push(row);
		}

		// Add Daily rows that don't exist in MERLIN (no double counting)
		let dailyOnlyCount = 0;
		for (const [key, row] of dailyRows) {
			if (!merlinRows.has(key)) {
				finalRows.push(row);
				dailyOnlyCount++;
			}
		}

		this.logger.log(
			`Facebook merged: ${merlinRows.size} from MERLIN + ${dailyOnlyCount} Daily-only = ${finalRows.length} total (${dailyRows.size - dailyOnlyCount} duplicates removed)`,
		);

		return finalRows;
	}

	/**
	 * Parse all FB files in a folder (flat files, no zip), merging and deduplicating.
	 * Used when folder has only flat files (no zips).
	 */
	private async parseFolder(
		folder: string,
		batchId: string,
	): Promise<FactDspRow[]> {
		const fileContents = new Map<string, string>();
		const allEntries = fs.readdirSync(folder).filter((f) => {
			const ext = path.extname(f).toLowerCase();
			return ['.csv', '.tsv', '.txt'].includes(ext);
		});

		for (const file of allEntries) {
			try {
				fileContents.set(
					file,
					fs.readFileSync(path.join(folder, file), 'utf-8'),
				);
			} catch (err) {
				this.logger.warn(`Failed to read ${file}: ${err.message}`);
			}
		}

		return this.parseFolderFromMemory(fileContents, batchId);
	}

	/**
	 * Generate dedup key: normalize product names across the two report types.
	 */
	private dedupeKey(row: FactDspRow): string {
		const product = this.normalizeProduct(row.metadata['product'] || '');
		return `${row.reporting_period}|${row.isrc}|${row.territory_code}|${product}|${row.usage_type}`;
	}

	/**
	 * Normalize product names to match between Daily and MERLIN files.
	 */
	private normalizeProduct(product: string): string {
		let p = product.toUpperCase().trim();
		if (p === 'FB_REELS_SFV') p = 'FB_REELS';
		if (p === 'IG_REELS_SFV') p = 'IG_REELS';
		return p;
	}

	// ── MERLIN content parser (from memory) ────────────────────

	private parseMerlinContent(
		content: string,
		filename: string,
		batchId: string,
	): FactDspRow[] {
		const rows: FactDspRow[] = [];
		const delimiter = filename.endsWith('.csv') ? ',' : '\t';

		const lines = content.split(/\r?\n/).filter((l) => l.trim());
		if (lines.length < 2) return rows;

		const headers = this.parseLine(lines[0], delimiter);

		for (let i = 1; i < lines.length; i++) {
			const values = this.parseLine(lines[i], delimiter);
			const record: Record<string, string> = {};
			headers.forEach((h, idx) => {
				record[h.trim()] = (values[idx] || '').trim();
			});

			let isrc = record['isrc']?.trim() || '';
			const upc =
				record['upc']?.trim() || record['product_code']?.trim() || '';
			if (!isrc && !upc) continue;

			if (!isrc && upc) {
				isrc = `UPC-${upc}`;
			}

			const row = this.createBaseRow(batchId);
			row.reporting_period = this.extractDateFromFilename(filename);
			row.isrc = isrc;
			row.territory_code = this.normalizeCountryCode(record['country']);
			row.track_title = record['title'] || '';
			row.artist_name = record['track_artist'] || '';
			row.licensor = record['owner_name'] || '';
			row.quantity_total = this.safeInt(record['event_count']);

			const isUgc = filename.includes('UGC');
			const isProd = filename.includes('PROD');
			const isFb = filename.includes('_FB_');
			const isIg = filename.includes('_IG_');

			row.usage_type = isProd ? 'production' : 'consumption';
			row.track_classification = isUgc ? 'UGC' : 'AL';

			row.metadata = {
				platform: isFb ? 'facebook' : isIg ? 'instagram' : 'meta',
				content_type: isUgc ? 'ugc' : 'al',
				source: 'merlin',
				...(record['product'] ? { product: record['product'] } : {}),
				...(record['genre'] ? { genre: record['genre'] } : {}),
				...(record['al_or_ugc']
					? { al_or_ugc: record['al_or_ugc'] }
					: {}),
			};

			rows.push(row);
		}

		return rows;
	}

	// ── Daily content parser (from memory) ─────────────────────

	private parseDailyContent(
		content: string,
		filename: string,
		batchId: string,
	): FactDspRow[] {
		const rows: FactDspRow[] = [];
		const isProd = filename.includes('production');
		const delimiter = filename.endsWith('.csv') ? ',' : '\t';

		const lines = content.split(/\r?\n/).filter((l) => l.trim());
		if (lines.length < 2) return rows;

		const headers = this.parseLine(lines[0], delimiter);

		for (let i = 1; i < lines.length; i++) {
			const values = this.parseLine(lines[i], delimiter);
			const record: Record<string, string> = {};
			headers.forEach((h, idx) => {
				record[h.trim()] = (values[idx] || '').trim();
			});

			let isrc = record['isrc']?.trim() || '';
			const upc =
				record['upc']?.trim() || record['product_code']?.trim() || '';
			if (!isrc && !upc) continue;

			if (!isrc && upc) {
				isrc = `UPC-${upc}`;
			}

			const product = record['product'] || '';
			const isFb = product.startsWith('FB_');
			const isIg = product.startsWith('IG_');
			const isUgc = product.includes('UGC');

			const row = this.createBaseRow(batchId);
			row.reporting_period = this.extractDateFromFilename(filename);
			row.isrc = isrc;
			row.territory_code = this.normalizeCountryCode(
				record['country_code'],
			);
			row.upc = record['upc'] || '';
			row.quantity_total = this.safeInt(record['events']);
			row.usage_type = isProd ? 'production' : 'consumption';
			row.track_classification = isUgc ? 'UGC' : 'AL';

			row.metadata = {
				platform: isFb ? 'facebook' : isIg ? 'instagram' : 'meta',
				content_type: isUgc ? 'ugc' : 'al',
				source: 'daily',
				product: product,
			};

			rows.push(row);
		}

		return rows;
	}

	// ── Daily file parser ───────────────────────────────

	private async parseDailyFile(
		filePath: string,
		batchId: string,
	): Promise<FactDspRow[]> {
		const rows: FactDspRow[] = [];
		const basename = path.basename(filePath);
		const isProd = basename.includes('production');
		const delimiter = this.getDelimiter(filePath);

		const fileContent = fs.readFileSync(filePath, 'utf-8');
		const lines = fileContent.split(/\r?\n/).filter((l) => l.trim());
		if (lines.length < 2) return rows;

		const headers = this.parseLine(lines[0], delimiter);

		for (let i = 1; i < lines.length; i++) {
			const values = this.parseLine(lines[i], delimiter);
			const record: Record<string, string> = {};
			headers.forEach((h, idx) => {
				record[h.trim()] = (values[idx] || '').trim();
			});

			let isrc = record['isrc']?.trim() || '';
			const upc =
				record['upc']?.trim() || record['product_code']?.trim() || '';
			if (!isrc && !upc) continue;

			if (!isrc && upc) {
				isrc = `UPC-${upc}`;
			}

			const product = record['product'] || '';
			const isFb = product.startsWith('FB_');
			const isIg = product.startsWith('IG_');
			const isUgc = product.includes('UGC');

			const row = this.createBaseRow(batchId);
			row.reporting_period = this.extractDateFromFilename(basename);
			row.isrc = isrc;
			row.territory_code = this.normalizeCountryCode(
				record['country_code'],
			);
			row.upc = record['upc'] || '';
			row.quantity_total = this.safeInt(record['events']);
			row.usage_type = isProd ? 'production' : 'consumption';
			row.track_classification = isUgc ? 'UGC' : 'AL';

			row.metadata = {
				platform: isFb ? 'facebook' : isIg ? 'instagram' : 'meta',
				content_type: isUgc ? 'ugc' : 'al',
				source: 'daily',
				product: product,
			};

			rows.push(row);
		}

		return rows;
	}

	// ── Usage report parser (for usage/ folder) ─────────

	protected parseRow(
		record: Record<string, string>,
		batchId: string,
		filePath: string,
	): FactDspRow | null {
		const basename = path.basename(filePath);

		// Only handle Usage-Report files here (usage/ folder)
		if (!basename.includes('Usage-Report')) return null;

		let isrc =
			record['elected_isrc']?.trim() || record['isrcs']?.trim() || '';
		const upc =
			record['upc']?.trim() || record['product_code']?.trim() || '';
		if (!isrc && !upc) return null;

		if (!isrc && upc) {
			isrc = `UPC-${upc}`;
		}

		const row = this.createBaseRow(batchId);
		row.reporting_period = this.normalizeDate(record['start_date']);
		row.isrc = isrc;
		row.territory_code = this.normalizeCountryCode(record['country']);
		row.track_title = record['track_title'] || '';
		row.artist_name = record['track_artist'] || '';
		row.quantity_total = this.safeInt(record['event_count']);
		row.usage_type = 'usage_report';

		const product = record['product'] || '';
		row.track_classification = product.includes('UGC') ? 'UGC' : 'AL';

		row.metadata = {
			product: product,
			source: 'usage_report',
			...(record['event_count_including_estimates']
				? {
						estimated_events:
							record['event_count_including_estimates'],
					}
				: {}),
			...(record['service'] ? { service: record['service'] } : {}),
		};

		return row;
	}
}
