import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { FactDspRow } from '../../interfaces';
import { BaseParser, ParserCatalogFieldMapping } from '../base.parser';

/**
 * SoundCloud Parser
 * Format: TSV (tab-delimited)
 * 4 sub-types per day:
 *   - Streamlevelreport: actual stream data with ISRC (PRIMARY — we import this)
 *   - Trackinformation: catalog metadata (track_id → isrc, artist, title, album)
 *   - Customerdata: user demographics (no ISRC — skip)
 *   - Playlistreporting: playlist info (no ISRC per row — skip)
 *
 * Strategy: Parse Trackinformation first to build a lookup (track_id → metadata),
 * then enrich Streamlevelreport rows with artist/title/album.
 */
export class SoundCloudParser extends BaseParser {
	constructor() {
		super('soundcloud');
	}

	/**
	 * SoundCloud joins Streamlevelreport and Trackinformation. Keep the source
	 * file in reportColumn so the catalog does not hide two different headers
	 * behind one field name; parserColumn remains the exact TSV header.
	 */
	getCatalogFieldMappings(): ParserCatalogFieldMapping[] {
		const mapping = (
			reportColumn: string,
			sourceFile: 'Streamlevelreport' | 'Trackinformation',
			targetColumn: string,
			transform = 'trim',
		): ParserCatalogFieldMapping => ({
			reportColumn: `${reportColumn} (${sourceFile})`,
			parserColumn: reportColumn,
			targetColumn,
			transform,
		});

		return [
			mapping('reporting_start_date', 'Streamlevelreport', 'reporting_period'),
			mapping('isrc', 'Streamlevelreport', 'isrc', 'isrc'),
			mapping('country', 'Streamlevelreport', 'territory_code'),
			mapping('track_id', 'Streamlevelreport', 'track_id_internal'),
			mapping('client_application', 'Streamlevelreport', 'metadata.client'),
			mapping('operating_system', 'Streamlevelreport', 'metadata.os'),
			mapping('play_length', 'Streamlevelreport', 'metadata.play_length_ms'),
			mapping('track_favorited', 'Streamlevelreport', 'metadata.favorited'),
			mapping(
				'track_reposted_shared',
				'Streamlevelreport',
				'metadata.reposted',
			),
			mapping('track_id', 'Trackinformation', 'track_id_internal'),
			mapping('isrc', 'Trackinformation', 'isrc', 'isrc'),
			mapping('track_artist', 'Trackinformation', 'artist_name'),
			mapping('track_title', 'Trackinformation', 'track_title'),
			mapping('album_name', 'Trackinformation', 'album_title'),
			mapping('album_code', 'Trackinformation', 'upc'),
		];
	}

	/** Process once per folder */
	private processedFolders = new Set<string>();

	async parseFile(filePath: string, batchId: string): Promise<FactDspRow[]> {
		const folder = path.dirname(filePath);

		// Only process once per folder
		if (this.processedFolders.has(folder + batchId)) {
			return [];
		}
		this.processedFolders.add(folder + batchId);

		// Check for zip files — extract first if needed
		const folderEntries = fs.readdirSync(folder);
		const hasZips = folderEntries.some((f) =>
			f.toLowerCase().endsWith('.zip'),
		);

		if (hasZips) {
			return this.extractAndParseFolder(folder, batchId);
		}

		return this.parseFolder(folder, batchId);
	}

	private async extractAndParseFolder(
		folder: string,
		batchId: string,
	): Promise<FactDspRow[]> {
		const os = require('os');
		const AdmZip = require('adm-zip');
		const tempDir = path.join(os.tmpdir(), `etl-sc-merge-${Date.now()}`);
		fs.mkdirSync(tempDir, { recursive: true });

		try {
			for (const entry of fs.readdirSync(folder)) {
				const fullPath = path.join(folder, entry);
				const lower = entry.toLowerCase();
				if (lower.endsWith('.zip')) {
					const zip = new AdmZip(fullPath);
					zip.extractAllTo(tempDir, true);
				} else if (
					lower.endsWith('.tsv') ||
					lower.endsWith('.tsv.gz')
				) {
					fs.copyFileSync(fullPath, path.join(tempDir, entry));
				}
			}
			return this.parseFolder(tempDir, batchId);
		} finally {
			try {
				fs.rmSync(tempDir, { recursive: true, force: true });
			} catch {
				/* ignore */
			}
		}
	}

	private async parseFolder(
		folder: string,
		batchId: string,
	): Promise<FactDspRow[]> {
		const allFiles = fs
			.readdirSync(folder)
			.filter((f) => f.endsWith('.tsv') || f.endsWith('.tsv.gz'));

		// Prefer .gz over uncompressed when both exist
		const gzSet = new Set(allFiles.filter((f) => f.endsWith('.gz')));
		const files = allFiles.filter((f) => {
			if (!f.endsWith('.gz') && gzSet.has(f + '.gz')) return false;
			return true;
		});

		// Group files by date
		const dateGroups = new Map<
			string,
			{ streams: string[]; tracks: string[] }
		>();

		for (const file of files) {
			// Extract date from filename: ..._YYYYMMDD_...
			const dateMatch = file.match(/_(\d{8})_/);
			if (!dateMatch) continue;
			const date = dateMatch[1];

			if (!dateGroups.has(date)) {
				dateGroups.set(date, { streams: [], tracks: [] });
			}

			if (file.includes('Streamlevelreport')) {
				dateGroups.get(date)!.streams.push(path.join(folder, file));
			} else if (file.includes('Trackinformation')) {
				dateGroups.get(date)!.tracks.push(path.join(folder, file));
			}
			// Skip Customerdata and Playlistreporting
		}

		const allRows: FactDspRow[] = [];

		for (const [date, group] of dateGroups) {
			// Step 1: Build track metadata lookup from Trackinformation
			const trackLookup = new Map<
				string,
				{
					artist: string;
					title: string;
					album: string;
					isrc: string;
					upc: string;
				}
			>();

			for (const trackFile of group.tracks) {
				const lines = this.readFileLines(trackFile);
				if (lines.length < 2) continue;

				const headers = this.parseLine(lines[0], '\t');

				for (let i = 1; i < lines.length; i++) {
					const values = this.parseLine(lines[i], '\t');
					const record: Record<string, string> = {};
					headers.forEach((h, idx) => {
						record[h.trim()] = (values[idx] || '').trim();
					});

					const trackId = record['track_id'];
					if (trackId) {
						trackLookup.set(trackId, {
							artist: record['track_artist'] || '',
							title: record['track_title'] || '',
							album: record['album_name'] || '',
							isrc: record['isrc'] || '',
							upc: record['album_code'] || '',
						});
					}
				}
			}

			this.logger.debug(
				`SoundCloud ${date}: ${trackLookup.size} tracks in catalog`,
			);

			// Step 2: Parse Streamlevelreport and enrich with track metadata
			for (const streamFile of group.streams) {
				const lines = this.readFileLines(streamFile);
				if (lines.length < 2) continue;

				const headers = this.parseLine(lines[0], '\t');

				for (let i = 1; i < lines.length; i++) {
					const values = this.parseLine(lines[i], '\t');
					const record: Record<string, string> = {};
					headers.forEach((h, idx) => {
						record[h.trim()] = (values[idx] || '').trim();
					});

					let isrc = record['isrc']?.trim() || '';
					const trackId = record['track_id'] || '';
					const trackMeta = trackLookup.get(trackId);

					if (!isrc && trackMeta?.isrc) {
						isrc = trackMeta.isrc.trim();
					}

					const upc = trackMeta?.upc?.trim() || '';

					if (!isrc && !upc) continue;

					if (!isrc && upc) {
						isrc = `UPC-${upc}`;
					}

					const row = this.createBaseRow(batchId);
					row.reporting_period = this.normalizeDate(
						record['reporting_start_date'],
					);
					row.isrc = isrc;
					row.territory_code = this.normalizeCountryCode(
						record['country'],
					);
					row.track_id_internal = trackId;
					row.quantity_total = 1; // Each row = 1 stream event
					row.usage_type = 'stream';

					// Enrich with Trackinformation metadata
					if (trackMeta) {
						row.artist_name = trackMeta.artist;
						row.track_title = trackMeta.title;
						row.album_title = trackMeta.album;
						row.upc = trackMeta.upc;
					}

					const playLength = this.safeInt(record['play_length']);
					row.metadata = {
						...(record['operating_system']
							? { os: record['operating_system'] }
							: {}),
						...(record['client_application']
							? { client: record['client_application'] }
							: {}),
						...(playLength > 0
							? { play_length_ms: String(playLength) }
							: {}),
						...(record['track_favorited'] === '1'
							? { favorited: '1' }
							: {}),
						...(record['track_reposted_shared'] === '1'
							? { reposted: '1' }
							: {}),
					};

					allRows.push(row);
				}
			}
		}

		// Aggregate by (date, isrc, country) to reduce rows
		const aggregated = new Map<string, FactDspRow>();

		for (const row of allRows) {
			const key = `${row.reporting_period}|${row.isrc}|${row.territory_code}`;

			if (aggregated.has(key)) {
				const existing = aggregated.get(key)!;
				existing.quantity_total += row.quantity_total;
			} else {
				aggregated.set(key, { ...row });
			}
		}

		this.logger.log(
			`SoundCloud: ${allRows.length} raw streams → ${aggregated.size} aggregated rows (${dateGroups.size} days, ${files.length} files)`,
		);

		return Array.from(aggregated.values());
	}

	/**
	 * Read file lines, supporting both plain and gzipped files.
	 */
	private readFileLines(filePath: string): string[] {
		let content: string;
		if (filePath.endsWith('.gz')) {
			const compressed = fs.readFileSync(filePath);
			content = zlib.gunzipSync(compressed).toString('utf-8');
		} else {
			content = fs.readFileSync(filePath, 'utf-8');
		}
		return content.split(/\r?\n/).filter((l) => l.trim());
	}

	// parseRow is not used (folder-level processing), but needed for base class
	protected parseRow(): FactDspRow | null {
		return null;
	}
}
