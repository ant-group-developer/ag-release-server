import * as path from 'path';
import { FactSalesRow } from '../../interfaces';
import { BaseSalesParser } from './base-sales.parser';

/** Deezer: handles main report + TB files. Skips market-share CSV. */
export class DeezerSalesParser extends BaseSalesParser {
	constructor() {
		super('deezer');
	}
	protected parseRow(
		r: Record<string, string>,
		batchId: string,
		filePath: string,
	): FactSalesRow | null {
		// Skip market-share files (different schema, aggregate level)
		if (path.basename(filePath).includes('market-share')) return null;
		const isrc = r['isrc'] || r['ISRC'] || '';
		if (!isrc) return null;
		const row = this.createBaseRow(batchId);
		row.reporting_period_start = this.normalizeDate(
			r['start_report'] || r['Start Report'],
			true,
			'DMY',
		);
		row.reporting_period_end = this.normalizeDate(
			r['end_report'] || r['End Report'],
			false,
			'DMY',
		);
		row.isrc = isrc;
		row.upc = r['upc'] || r['UPC'] || '';
		row.territory_code = this.normalizeCountryCode(
			r['country'] || r['Country'] || '',
		);
		row.track_title = r['title'] || r['Title'] || '';
		row.artist_name = r['artist'] || r['Artist'] || '';
		row.album_title = r['album'] || r['Album'] || '';
		row.label_name = r['label'] || r['Label'] || '';
		row.member_name = r['provider'] || r['Provider'] || '';
		row.quantity = this.safeInt(
			r['nb_of_plays'] || r['Nb of plays'] || '0',
		);
		const rawLocal = r['royalties'] || r['Royalties'] || '0';
		row.revenue_currency = 'USD';
		row.revenue_local = this.safeDecimal(rawLocal);
		row.revenue_usd = this.safeDecimal(rawLocal);
		row.service_tier = r['service'] || r['Service'] || '';
		row.plan_name = r['service_name'] || r['Service_name'] || '';
		return row;
	}
}

/** Pandora DDEX: 2 header rows (summary + blank/header), 4 tier files per folder. */
export class PandoraSalesParser extends BaseSalesParser {
	private currentCommercialModel = '';
	constructor() {
		super('pandora');
		this.skipHeaderRows = 2; // Skip summary row + its header
	}
	protected onSkippedHeaderRow(lineNum: number, line: string): void {
		// Row 2 has CommercialModelType at end
		if (lineNum === 2) {
			const parts = line.split(',');
			this.currentCommercialModel = (parts[parts.length - 1] || '')
				.replace(/"/g, '')
				.trim();
		}
	}
	protected parseRow(
		r: Record<string, string>,
		batchId: string,
	): FactSalesRow | null {
		const isrc = r['ISRC'] || '';
		if (!isrc) return null;
		const row = this.createBaseRow(batchId);
		row.reporting_period_start = this.normalizeDate(r['SalesDate']);
		row.reporting_period_end = this.normalizeDate(r['SalesDate']);
		row.dpid = r['DSP'] || '';
		row.member_name = r['Member'] || '';
		row.label_name = r['LabelName'] || '';
		row.isrc = isrc;
		row.upc = r['UPC'] || '';
		row.territory_code = this.normalizeCountryCode(
			r['TerritoryCode'] || '',
		);
		row.track_title = r['ResourceTitle'] || '';
		row.artist_name = r['Contributors'] || '';
		row.album_title = r['ReleaseTitle'] || '';
		row.genre = r['Genre'] || '';
		row.quantity = this.safeInt(r['NumberOfConsumerSalesGross'] || '0');
		const rawLocal = r['EffectiveRoyaltyRate'] || '0';
		const currency = r['CurrencyCode'] || 'USD';
		row.revenue_currency = currency;
		row.revenue_local = this.safeDecimal(rawLocal);
		row.revenue_usd =
			currency.toUpperCase() === 'USD' ? this.safeDecimal(rawLocal) : '0';
		row.usage_type = r['UseType'] || '';
		row.plan_name = r['PlanName'] || '';
		row.commercial_model = this.currentCommercialModel;
		row.service_tier = r['PriceRangeType'] || '';
		return row;
	}
}

/** Facebook/Meta: 6 file types. AL/UGC Consumption/Production have ISRC. SFV/WhatsApp are aggregate. */
export class FacebookSalesParser extends BaseSalesParser {
	constructor() {
		super('facebook');
	}
	protected parseRow(
		r: Record<string, string>,
		batchId: string,
		filePath: string,
	): FactSalesRow | null {
		const basename = path.basename(filePath);
		// SFV + WhatsApp aggregate files (no ISRC)
		if (basename.includes('SFV') || basename.includes('WhatsApp')) {
			return null;
		}
		// AL/UGC files with ISRC
		const isrc = r['elected_isrc'] || '';
		if (!isrc) return null;
		const row = this.createBaseRow(batchId);
		row.reporting_period_start = this.normalizeDate(r['start_date']);
		row.reporting_period_end = this.normalizeDate(r['end_date']);
		row.service_name = r['service'] || 'Meta';
		row.member_name = r['page_name'] || '';
		row.isrc = isrc;
		row.release_id = r['release_id'] || '';
		row.territory_code = this.normalizeCountryCode(r['country'] || '');
		row.track_title = r['track_title'] || '';
		row.artist_name = r['track_artist'] || '';
		row.quantity = this.safeInt(r['event_count'] || '0');
		const rawUsd = r['usd_payable'] || '0';
		row.revenue_currency = 'USD';
		row.revenue_local = this.safeDecimal(rawUsd);
		row.revenue_usd = this.safeDecimal(rawUsd);
		row.usage_type = r['product'] || '';
		if (r['event_count_including_estimates']) {
			row.metadata = {
				event_count_estimates: r['event_count_including_estimates'],
			};
		}
		return row;
	}
}

/** Spotify: .gz files, 2 header rows. Main data = track-for-streaming + track-for-breakage. */
export class SpotifySalesParser extends BaseSalesParser {
	constructor() {
		super('spotify');
		this.skipHeaderRows = 2; // Format version row + metadata row
	}
	protected parseRow(
		r: Record<string, string>,
		batchId: string,
		filePath: string,
	): FactSalesRow | null {
		const basename = path.basename(filePath).toLowerCase();
		// Only parse track-level files, skip revshare/summary aggregates
		if (basename.includes('revshare') || basename.includes('summary'))
			return null;
		const isrc = r['ISRC'] || '';
		if (!isrc) return null;
		const row = this.createBaseRow(batchId);
		// Dates come from the skipped header rows; fallback to filename extraction
		row.reporting_period_start = this.extractPeriodFromFilename(
			basename,
			true,
		);
		row.reporting_period_end = this.extractPeriodFromFilename(
			basename,
			false,
		);
		row.service_name = 'Spotify';
		row.label_name = r['Label'] || '';
		row.isrc = isrc;
		row.upc = r['UPC'] || '';
		row.territory_code = this.normalizeCountryCode(r['Country'] || '');
		row.track_title = r['Track name'] || '';
		row.artist_name = r['Artist name'] || '';
		row.composer_name = r['Composer name'] || '';
		row.album_title = r['Album name'] || '';
		row.quantity = this.safeInt(r['Quantity'] || '0');
		const rawLocal = r['Payable'] || '0';
		const currency = r['Payable currency'] || 'USD';
		row.revenue_currency = currency;
		row.revenue_local = this.safeDecimal(rawLocal);
		row.revenue_usd =
			currency.toUpperCase() === 'USD' ? this.safeDecimal(rawLocal) : '0';
		row.service_tier = r['Product'] || '';
		row.usage_type = basename.includes('breakage')
			? 'breakage'
			: 'streaming';
		if (r['URI']) row.metadata = { spotify_uri: r['URI'] };
		return row;
	}
	private extractPeriodFromFilename(
		filename: string,
		isStart: boolean,
	): string {
		const match = filename.match(/(\d{6})/);
		if (match) {
			const y = match[1].substring(0, 4),
				m = match[1].substring(4, 6);
			if (isStart) return `${y}-${m}-01`;
			const lastDay = new Date(parseInt(y), parseInt(m), 0).getDate();
			return `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
		}
		return '1970-01-01';
	}
}

/** Vevo: CSV with revenue split fields. */
export class VevoSalesParser extends BaseSalesParser {
	constructor() {
		super('vevo');
	}
	protected parseRow(
		r: Record<string, string>,
		batchId: string,
	): FactSalesRow | null {
		const isrc = r['isrc'] || '';
		if (!isrc) return null;
		const row = this.createBaseRow(batchId);
		row.reporting_period_start = this.normalizeDate(r['start_date']);
		row.reporting_period_end = this.normalizeDate(r['end_date']);
		row.service_name = r['provider'] || 'VEVO';
		row.dpid = r['dpid'] || '';
		row.label_name = r['label'] || '';
		row.isrc = isrc;
		row.upc = r['upc'] || '';
		row.territory_code = this.normalizeCountryCode(r['territory'] || '');
		row.track_title = r['song_title'] || '';
		row.artist_name = r['artist_name'] || '';
		row.genre = r['genre'] || '';
		row.release_id = r['external_id'] || '';
		row.quantity = this.safeInt(r['quantity'] || '0');
		const rawLocal = r['net_revenue'] || '0';
		const currency = r['currency'] || 'USD';
		row.revenue_currency = currency;
		row.revenue_local = this.safeDecimal(rawLocal);
		row.revenue_usd =
			currency.toUpperCase() === 'USD' ? this.safeDecimal(rawLocal) : '0';
		row.service_tier = r['platform'] || '';
		row.usage_type = 'view';
		if (r['rev_share']) row.metadata = { rev_share: r['rev_share'] };
		if (r['video_id'])
			row.metadata = { ...row.metadata, video_id: r['video_id'] };
		return row;
	}
}

/** TikTok: zipped CSV with video_creations + video_views. */
export class TiktokSalesParser extends BaseSalesParser {
	constructor() {
		super('tiktok');
	}
	protected parseRow(
		r: Record<string, string>,
		batchId: string,
	): FactSalesRow | null {
		const isrc = r['isrc'] || '';
		if (!isrc) return null;
		const row = this.createBaseRow(batchId);
		row.reporting_period_start = this.normalizeDate(r['report_start_date']);
		row.reporting_period_end = this.normalizeDate(r['report_end_date']);
		row.service_name = r['platform_name'] || 'TikTok';
		row.dpid = r['provider_dpid'] || '';
		row.member_name = r['content_provider'] || '';
		row.label_name = r['label_name'] || '';
		row.isrc = isrc;
		row.upc = r['product_code'] || '';
		row.territory_code = this.normalizeCountryCode(r['territory'] || '');
		row.track_title = r['song_title'] || '';
		row.artist_name = r['artist'] || '';
		row.album_title = r['album'] || '';
		row.genre = r['genre'] || '';
		row.quantity_creations = this.safeInt(r['video_creations'] || '0');
		row.quantity_views = this.safeInt(r['video_views'] || '0');
		row.quantity = row.quantity_creations + row.quantity_views;
		const rawLocal = r['statement_amount'] || '0';
		const currency = r['statement_currency'] || 'USD';
		row.revenue_currency = currency;
		row.revenue_local = this.safeDecimal(rawLocal);
		row.revenue_usd =
			currency.toUpperCase() === 'USD' ? this.safeDecimal(rawLocal) : '0';
		row.usage_type = r['content_type'] || 'UGC';
		if (r['platform_song_id'])
			row.metadata = { platform_song_id: r['platform_song_id'] };
		return row;
	}
}

/** Snap: CSV with dual quantity (creations + views). */
export class SnapSalesParser extends BaseSalesParser {
	constructor() {
		super('snap');
	}
	protected parseRow(
		r: Record<string, string>,
		batchId: string,
	): FactSalesRow | null {
		const isrc = r['ISRC'] || '';
		if (!isrc) return null;
		const row = this.createBaseRow(batchId);
		row.reporting_period_start = this.normalizeDate(r['Start_Date']);
		row.reporting_period_end = this.normalizeDate(r['End_Date']);
		row.service_name = r['Service'] || 'Snap';
		row.dpid = r['DPID'] || '';
		row.member_name = r['Member_Name'] || '';
		row.label_name = r['Label_Name'] || '';
		row.isrc = isrc;
		row.grid = r['GRID'] || '';
		row.genre = r['Genre'] || '';
		row.territory_code = this.normalizeCountryCode(r['Country'] || '');
		row.track_title = r['Track_Title'] || '';
		row.artist_name = r['Artist_Name'] || '';
		row.album_title = r['Release_Title'] || '';
		row.release_id = r['Release_Id'] || '';
		row.quantity_creations = this.safeInt(r['Quantity_Creations'] || '0');
		row.quantity_views = this.safeInt(r['Quantity_Views'] || '0');
		row.quantity = row.quantity_creations + row.quantity_views;
		const rawUsd = r['Total_Payable_USD'] || '0';
		row.revenue_currency = 'USD';
		row.revenue_local = this.safeDecimal(rawUsd);
		row.revenue_usd = this.safeDecimal(rawUsd);
		row.usage_type = 'ugc';
		return row;
	}
}

/** Boomplay: TSV format (tab-delimited). */
export class BoomplaySalesParser extends BaseSalesParser {
	constructor() {
		super('boomplay');
	}
	protected parseRow(
		r: Record<string, string>,
		batchId: string,
	): FactSalesRow | null {
		const isrc = r['ISRC'] || '';
		if (!isrc) return null;
		const row = this.createBaseRow(batchId);
		row.reporting_period_start = this.normalizeDate(r['Start_Date']);
		row.reporting_period_end = this.normalizeDate(r['End_Date']);
		row.service_name = r['Service'] || 'Boomplay';
		row.dpid = r['DPID'] || '';
		row.member_name = r['Member_Name'] || '';
		row.label_name = r['Label_Name'] || '';
		row.isrc = isrc;
		row.grid = r['GRID'] || '';
		row.genre = r['Genre'] || '';
		row.territory_code = this.normalizeCountryCode(
			r['Country_Of_Sale'] || '',
		);
		row.track_title = r['Track_Title'] || '';
		row.artist_name = r['Artist_Name'] || '';
		row.album_title = r['Release_Title'] || '';
		row.release_id = r['Release_ID'] || '';
		row.quantity = this.safeInt(r['Quantity'] || '0');
		const rawUsd = r['Total_Payable_USD'] || '0';
		const rawLocal = r['Total_Payable'] || rawUsd;
		const currency = r['Retail_Currency'] || 'USD';
		row.revenue_currency = currency;
		row.revenue_local = this.safeDecimal(rawLocal);
		row.revenue_usd =
			rawUsd !== '0'
				? this.safeDecimal(rawUsd)
				: currency.toUpperCase() === 'USD'
					? this.safeDecimal(rawLocal)
					: '0';
		row.commercial_model = r['Commercial_Model'] || '';
		row.service_tier = r['Service_Type'] || '';
		row.usage_type = r['Type_Of_Play'] || '';
		const meta: Record<string, string> = {};
		if (r['Sound_Quality']) meta.sound_quality = r['Sound_Quality'];
		if (r['Price_Code']) meta.price_code = r['Price_Code'];
		if (Object.keys(meta).length) row.metadata = meta;
		return row;
	}
}
