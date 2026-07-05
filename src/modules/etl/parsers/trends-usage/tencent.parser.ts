import * as path from 'path';
import { FactDspRow } from '../../interfaces';
import { BaseParser } from '../base.parser';

/**
 * Parser for Tencent Music Entertainment (TME) trend data.
 * Covers: QQMusic, Kugou, Kuwo
 *
 * File format: CSV (inside .zip, tab-delimited despite .csv extension)
 * Headers: ranking, date, platform, contract_no, cp_name, label_name,
 *          merlin_member_name, dpid, album, song, artist, isrc, upc,
 *          stream, ftrack_id
 */
export class TencentParser extends BaseParser {
	constructor() {
		super('tencent');
	}

	protected getDelimiter(filePath: string): string {
		// Tencent CSV files are actually tab-delimited
		return '\t';
	}

	protected parseRow(
		record: Record<string, string>,
		batchId: string,
		filePath: string,
	): FactDspRow | null {
		let isrc = record['isrc']?.trim() || '';
		const upc = record['upc']?.trim() || '';
		const streams = this.safeInt(record['stream']);

		if ((!isrc && !upc) || streams === 0) return null;

		if (!isrc && upc) {
			isrc = `UPC-${upc}`;
		}

		// Determine sub-platform from filename or record
		const platform =
			record['platform'] || this.extractPlatformFromFilename(filePath);
		const dspSuffix = this.normalizePlatform(platform);

		const row = this.createBaseRow(batchId);
		row.dsp_id = `tencent-${dspSuffix}`;
		row.reporting_period = record['date']
			? this.normalizeDate(record['date'])
			: this.extractDateFromFilename(filePath);
		row.isrc = isrc;
		row.upc = record['upc'] || '';
		row.track_title = record['song'] || '';
		row.album_title = record['album'] || '';
		row.artist_name = record['artist'] || '';
		row.label_name = record['label_name'] || '';
		row.partner_id = record['dpid'] || '';
		row.licensor = record['merlin_member_name'] || '';
		row.quantity_total = streams;
		row.usage_type = 'STREAM';
		row.track_id_internal = record['ftrack_id'] || '';

		row.metadata = {
			platform,
			ranking: String(this.safeInt(record['ranking'])),
			contract_no: record['contract_no'] || '',
			cp_name: record['cp_name'] || '',
		};

		return row;
	}

	/**
	 * Extract platform name from filename.
	 * e.g. "TrendsData_QQMusic_20260406.csv" → "QQMusic"
	 *      "TrendsData_Kugou_20260406.csv" → "Kugou"
	 */
	private extractPlatformFromFilename(filePath: string): string {
		const basename = path.basename(filePath);
		const match = basename.match(/TrendsData_(\w+?)_\d{8}/);
		return match ? match[1] : 'unknown';
	}

	/**
	 * Normalize platform name to lowercase slug.
	 */
	private normalizePlatform(platform: string): string {
		const p = platform.toLowerCase();
		if (p.includes('qqmusic') || p === 'qq') return 'qqmusic';
		if (p.includes('kugou')) return 'kugou';
		if (p.includes('kuwo')) return 'kuwo';
		return p;
	}
}
