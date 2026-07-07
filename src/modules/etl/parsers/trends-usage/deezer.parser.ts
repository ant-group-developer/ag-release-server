import * as path from 'path';
import { FactDspRow } from '../../interfaces';
import { BaseParser } from '../base.parser';

/**
 * Deezer Parser
 * Format: TSV (.txt files, tab-delimited)
 * Two file types inside each ZIP:
 *   - Regular: BombshelterDigitalMERLIN_YYYYMMDD_YYYYMMDD.txt      → IMPORT
 *   - _TB:     BombshelterDigitalMERLIN_YYYYMMDD_YYYYMMDD_TB.txt   → SKIP
 *
 * _TB files are a tiny subset (~6 rows vs ~93 Regular) where ~67% of ISRCs
 * already exist in Regular. Importing both causes double-counted plays.
 *
 * Columns: Start Report, End Report, ISRC, Artist, Title, Album, UPC,
 *          Country, Nb of plays, Royalties, Service, Provider, provider_id,
 *          Label, Service_name, Track_duration, Play_percent, Cached_play,
 *          Context_type, Playlist_Id, Playlist_name, User_id, Gender,
 *          Birth_year, Device_type, OS
 */
export class DeezerParser extends BaseParser {
	constructor() {
		super('deezer');
	}

	protected parseRow(
		record: Record<string, string>,
		batchId: string,
		filePath: string,
	): FactDspRow | null {
		// Skip _TB files entirely — they overlap with Regular and cause double-counting
		if (path.basename(filePath).includes('_TB')) return null;

		let isrc = record['ISRC']?.trim() || '';
		const upc = record['UPC']?.trim() || '';
		if (!isrc && !upc) return null;

		if (!isrc && upc) {
			isrc = `UPC-${upc}`;
		}

		const row = this.createBaseRow(batchId);
		// Date format: DD-MM-YYYY
		row.reporting_period = this.normalizeDate(record['Start Report']);
		row.isrc = isrc;
		row.territory_code = this.normalizeCountryCode(record['Country']);
		row.track_title = record['Title'] || '';
		row.artist_name = record['Artist'] || '';
		row.album_title = record['Album'] || '';
		row.upc = record['UPC'] || '';
		row.label_name = record['Label'] || '';
		row.partner_id = record['provider_id'] || '';
		row.licensor = record['Provider'] || '';
		row.quantity_total = this.safeInt(record['Nb of plays']);
		row.monetisation_type = this.mapDeezerService(record['Service']);
		row.usage_type = 'stream';
		row.account_identifier = record['Service_name'] || '';

		row.metadata = {
			...(record['Play_percent']
				? { play_percent: record['Play_percent'] }
				: {}),
			...(record['Cached_play']
				? { cached_play: record['Cached_play'] }
				: {}),
			...(record['Gender'] && record['Gender'] !== ''
				? { gender: record['Gender'] }
				: {}),
			...(record['Birth_year'] && record['Birth_year'] !== ''
				? { birth_year: record['Birth_year'] }
				: {}),
			...(record['Device_type']
				? { device_type: record['Device_type'] }
				: {}),
			...(record['OS'] ? { os: record['OS'] } : {}),
			...(record['Context_type']
				? { context_type: record['Context_type'] }
				: {}),
			...(record['Track_duration']
				? { track_duration: record['Track_duration'] }
				: {}),
			...(record['Royalties'] && record['Royalties'] !== '0.0000'
				? { royalties: record['Royalties'] }
				: {}),
		};

		return row;
	}

	/**
	 * Map Deezer service codes to monetisation types.
	 * GOO = Premium, DUO = Duo plan, FAMILYHIFI = Family, FREE = Free, etc.
	 */
	private mapDeezerService(service: string): string {
		if (!service) return '';
		const s = service.toUpperCase();
		if (s.includes('FREE') || s === 'ADS') return 'FREE';
		// Everything else is some form of paid subscription
		return 'SUBS';
	}
}
