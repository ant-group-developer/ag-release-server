import * as path from 'path';
import { FactDspRow } from '../../interfaces';
import { BaseParser } from '../base.parser';

/**
 * Deezer Illegitimate: daily zipped fraud_report_*.txt files.
 * Schema: SONG_ID, SONG_TITLE, ISRC, ALBUM_TITLE, ALBUM_UPC, ARTIST_NAME, LABEL_NAME, COUNTRY, NB_STREAMS, NB_DISTINCT_USERS
 */
export class DeezerIllegitimateParser extends BaseParser {
	constructor() {
		super('deezer');
	}

	protected getDelimiter(): string {
		return ',';
	}

	protected parseRow(
		record: Record<string, string>,
		batchId: string,
		filePath: string,
	): FactDspRow | null {
		const isrc = record['ISRC'] || '';
		if (!isrc) return null;

		const row = this.createBaseRow(batchId);
		// Extract date from filename: fraud_report_merlin_bombshelterdigitalmerlin-20250801.txt
		row.reporting_period = this.extractDateFromFilename(filePath);
		row.isrc = isrc;
		row.upc = record['ALBUM_UPC'] || '';
		row.track_title = record['SONG_TITLE'] || '';
		row.artist_name = record['ARTIST_NAME'] || '';
		row.album_title = record['ALBUM_TITLE'] || '';
		row.label_name = record['LABEL_NAME'] || '';
		row.territory_code = this.normalizeCountryCode(record['COUNTRY'] || '');
		row.quantity_total = 0;
		row.quantity_invalid = this.safeInt(record['NB_STREAMS'] || '0');
		row.quantity_unique_users = this.safeInt(
			record['NB_DISTINCT_USERS'] || '0',
		);
		row.source_category = 'illegitimate';
		row.metadata = {};
		if (record['SONG_ID']) row.metadata.song_id = record['SONG_ID'];
		return row;
	}
}

/**
 * SoundCloud Illegitimate: monthly zipped CSV.
 * Schema: partnerUrn, partner_id, label_name, ..., isrc, ..., territory, invalid_plays, monetisation_type, usage_type
 */
export class SoundCloudIllegitimateParser extends BaseParser {
	constructor() {
		super('soundcloud');
	}

	protected parseRow(
		record: Record<string, string>,
		batchId: string,
		filePath: string,
	): FactDspRow | null {
		const isrc = record['isrc'] || '';
		if (!isrc) return null;

		const row = this.createBaseRow(batchId);
		// Extract period from filename: *_merlin-invalid-plays_2025-08.csv
		const basename = path.basename(filePath);
		const periodMatch = basename.match(/(\d{4})-(\d{2})/);
		row.reporting_period = periodMatch
			? `${periodMatch[1]}-${periodMatch[2]}-01`
			: this.extractDateFromFilename(filePath);
		row.isrc = isrc;
		row.upc = record['upc'] || '';
		row.track_title = record['track_title'] || '';
		row.artist_name = record['artist_name'] || '';
		row.album_title = record['album_title'] || '';
		row.label_name = record['label_name'] || '';
		row.territory_code = this.normalizeCountryCode(
			record['territory'] || '',
		);
		row.quantity_total = 0;
		row.quantity_invalid = this.safeInt(record['invalid_plays'] || '0');
		row.monetisation_type = record['monetisation_type'] || '';
		row.usage_type = record['usage_type'] || '';
		row.source_category = 'illegitimate';
		row.metadata = {};
		if (record['account_name'])
			row.metadata.account_name = record['account_name'];
		if (record['track_id']) row.metadata.track_id = record['track_id'];
		return row;
	}
}

/**
 * Spotify Illegitimate: TSV files.
 * Schema: Licensor, Country, Product Type, URI, UPC, EAN, ISRC, Track Name, Artist Name, Composer Name, Album Name, Label, Quantity
 */
export class SpotifyIllegitimateParser extends BaseParser {
	constructor() {
		super('spotify');
	}

	protected getDelimiter(): string {
		return '\t';
	}

	protected parseRow(
		record: Record<string, string>,
		batchId: string,
		filePath: string,
	): FactDspRow | null {
		const isrc = record['ISRC'] || '';
		if (!isrc) return null;

		const row = this.createBaseRow(batchId);
		// Extract period from filename: ...-202312.txt
		const basename = path.basename(filePath);
		const periodMatch = basename.match(/(\d{4})(\d{2})\.txt$/);
		row.reporting_period = periodMatch
			? `${periodMatch[1]}-${periodMatch[2]}-01`
			: this.extractDateFromFilename(filePath);

		row.isrc = isrc;
		row.upc = record['UPC'] || '';
		row.track_title = record['Track Name'] || '';
		row.artist_name = record['Artist Name'] || '';
		row.album_title = record['Album Name'] || '';
		row.label_name = record['Label'] || '';
		row.territory_code = this.normalizeCountryCode(record['Country'] || '');
		row.quantity_total = 0;
		row.quantity_invalid = this.safeInt(record['Quantity'] || '0');
		row.monetisation_type = record['Product Type'] || '';
		row.source_category = 'illegitimate';
		row.metadata = {};
		if (record['URI']) row.metadata.spotify_uri = record['URI'];
		return row;
	}
}

/**
 * TikTok Illegitimate: CSV files.
 * Schema: report_start_date, report_end_date, removal_reason, territory, content_provider, sublabel, metasong_id, isrc, upc, artist_name, track_title, content_type, creations, video_views, likes, shares, comments, favorites
 */
export class TiktokIllegitimateParser extends BaseParser {
	constructor() {
		super('tiktok');
	}

	protected parseRow(
		record: Record<string, string>,
		batchId: string,
		filePath: string,
	): FactDspRow | null {
		const isrc = record['isrc'] || '';
		if (!isrc) return null;

		const row = this.createBaseRow(batchId);
		row.reporting_period = this.normalizeDate(record['report_start_date']);

		row.isrc = isrc;
		row.upc = record['upc'] || '';
		row.track_title = record['track_title'] || '';
		row.artist_name = record['artist_name'] || '';
		row.label_name = record['sublabel'] || '';
		row.territory_code = this.normalizeCountryCode(
			record['territory'] || '',
		);
		row.quantity_total = 0;

		const creations = this.safeInt(record['creations'] || '0');
		const views = this.safeInt(record['video_views'] || '0');
		row.quantity_invalid = creations; // Map creations to invalid count for standard reporting

		row.monetisation_type = record['content_type'] || '';
		row.usage_type = record['removal_reason'] || '';
		row.source_category = 'illegitimate';

		row.metadata = {};
		if (record['metasong_id'])
			row.metadata.metasong_id = record['metasong_id'];
		if (record['creations']) row.metadata.creations = creations.toString();
		if (record['video_views']) row.metadata.video_views = views.toString();
		if (record['likes'])
			row.metadata.likes = this.safeInt(record['likes']).toString();
		if (record['shares'])
			row.metadata.shares = this.safeInt(record['shares']).toString();
		if (record['comments'])
			row.metadata.comments = this.safeInt(record['comments']).toString();
		return row;
	}
}
