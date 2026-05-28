import { BaseSalesParser } from './base-sales.parser';
import { FactSalesRow } from '../../interfaces';

export class AnghamiSalesParser extends BaseSalesParser {
  constructor() { super('anghami'); }
  protected parseRow(r: Record<string, string>, batchId: string): FactSalesRow | null {
    const isrc = r['ISRC'] || '';
    if (!isrc) return null;
    const row = this.createBaseRow(batchId);
    row.reporting_period_start = this.normalizeDate(r['Start Date']);
    row.reporting_period_end = this.normalizeDate(r['End Date']);
    row.service_name = r['Service Name'] || 'Anghami';
    row.dpid = r['DPID'] || '';
    row.member_name = r['Member Name'] || '';
    row.label_name = r['Label Name'] || '';
    row.isrc = isrc;
    row.release_id = r['Release ID'] || '';
    row.genre = r['Genre'] || '';
    row.territory_code = this.normalizeCountryCode(r['Country of Sale'] || '');
    row.track_title = r['Track Title'] || '';
    row.artist_name = r['Artist Name'] || '';
    row.album_title = r['Release Title'] || '';
    row.quantity = this.safeInt(r['Quantity'] || '0');
    const rawLocal = r['Total Payable'] || '0';
    const currency = r['Currency'] || 'USD';
    row.revenue_currency = currency;
    row.revenue_local = this.safeDecimal(rawLocal);
    row.revenue_usd = currency.toUpperCase() === 'USD' ? this.safeDecimal(rawLocal) : '0';
    row.service_tier = r['Service Tier'] || '';
    row.plan_name = r['Service Plan'] || '';
    row.usage_type = r['Type of Play'] || '';
    return row;
  }
}

export class AwaSalesParser extends BaseSalesParser {
  constructor() { super('awa'); }
  protected parseRow(r: Record<string, string>, batchId: string): FactSalesRow | null {
    const isrc = r['isrc_id'] || '';
    if (!isrc) return null;
    const row = this.createBaseRow(batchId);
    row.reporting_period_start = this.normalizeDate(r['Report Date'] || r['Transaction Date']);
    row.reporting_period_end = this.normalizeDate(r['Report Date'] || r['Transaction Date']);
    row.dpid = r['DPID'] || '';
    row.member_name = r['Member_id'] || '';
    row.label_name = r['label_id'] || '';
    row.isrc = isrc;
    row.release_id = r['release_id'] || '';
    row.genre = r['Genre'] || '';
    row.territory_code = this.normalizeCountryCode(r['territory_code'] || '');
    row.track_title = r['Track_title'] || '';
    row.artist_name = r['Artist'] || '';
    row.album_title = r['release_title'] || '';
    row.quantity = this.safeInt(r['quantity'] || '0');
    const rawUsd = r['Total in USD'] || '0';
    const rawLocal = r['Net Royalty Total'] || rawUsd;
    const currency = r['DSP_currency'] || 'USD';
    row.revenue_currency = currency;
    row.revenue_local = this.safeDecimal(rawLocal);
    row.revenue_usd = rawUsd !== '0' ? this.safeDecimal(rawUsd) : (currency.toUpperCase() === 'USD' ? this.safeDecimal(rawLocal) : '0');
    row.monetisation_type = r['User Type'] || '';
    row.usage_type = r['Type'] || 'stream';
    if (r['customer_price']) row.metadata = { customer_price: r['customer_price'] };
    return row;
  }
}

export class IheartSalesParser extends BaseSalesParser {
  constructor() { super('iheart'); }
  protected getDelimiter(): string { return '\t'; }
  protected parseRow(r: Record<string, string>, batchId: string): FactSalesRow | null {
    const isrc = r['ISRC'] || '';
    if (!isrc) return null;
    const row = this.createBaseRow(batchId);
    row.reporting_period_start = this.normalizeDate(r['ReportStartDt']);
    row.reporting_period_end = this.normalizeDate(r['ReportEndDt']);
    row.service_name = r['EntityName'] || 'iHeart';
    row.member_name = r['Merlin Member'] || '';
    row.label_name = r['Label Code'] || '';
    row.isrc = isrc;
    row.upc = r['UPC'] || '';
    row.territory_code = this.normalizeCountryCode(r['Country'] || '');
    row.track_title = r['Track Name'] || '';
    row.artist_name = r['Artist Name'] || '';
    row.album_title = r['Album Name'] || '';
    row.release_id = r['Album ID'] || '';
    row.quantity = this.safeInt(r['# Streams'] || '0');
    const rawLocal = r['Price'] || '0';
    const currency = r['Curr'] || 'USD';
    row.revenue_currency = currency;
    row.revenue_local = this.safeDecimal(rawLocal);
    row.revenue_usd = currency.toUpperCase() === 'USD' ? this.safeDecimal(rawLocal) : '0';
    row.service_tier = r['ProductTier'] || '';
    row.usage_type = 'stream';
    if (r['Track ID']) row.metadata = { track_id: r['Track ID'] };
    return row;
  }
}

export class SoundcloudSalesParser extends BaseSalesParser {
  constructor() { super('soundcloud'); }
  protected parseRow(r: Record<string, string>, batchId: string): FactSalesRow | null {
    const isrc = r['isrc'] || r['ISRC'] || '';
    if (!isrc) return null;
    const row = this.createBaseRow(batchId);
    const reportPeriod = r['reporting_period_start'] || r['report_period_start'] || r['Reporting Period'] || '';
    row.reporting_period_start = this.normalizeDate(reportPeriod);
    row.reporting_period_end = this.normalizeDate(r['reporting_period_end'] || r['report_period_end'] || r['Reporting Period'] || '');
    row.service_name = r['partner_name'] || r['Partner Name'] || 'SoundCloud';
    row.member_name = r['partner_id'] || r['Partner ID'] || '';
    row.label_name = r['label_name'] || r['Label Name'] || '';
    row.isrc = isrc;
    row.upc = r['upc'] || r['UPC'] || '';
    row.territory_code = this.normalizeCountryCode(r['territory'] || r['Territory'] || '');
    row.track_title = r['track_title'] || r['Track Name'] || '';
    row.artist_name = r['artist_name'] || r['Artist Name'] || '';
    row.album_title = r['album_title'] || r['Album Title'] || '';
    row.quantity = this.safeInt(r['plays'] || r['Total Plays'] || '0');
    const rawUsd = r['usd_payable'] || r['Total Revenue'] || '0';
    const rawLocal = r['net_revenue'] || r['Total Amount'] || rawUsd;
    const currency = r['currency'] || r['Revenue Currency'] || 'USD';
    row.revenue_currency = currency;
    row.revenue_local = this.safeDecimal(rawLocal);
    row.revenue_usd = rawUsd !== '0' ? this.safeDecimal(rawUsd) : (currency.toUpperCase() === 'USD' ? this.safeDecimal(rawLocal) : '0');
    row.monetisation_type = r['monetisation_type'] || r['Monetisation Type'] || '';
    row.usage_type = r['usage_type'] || r['Usage Type'] || '';
    if (r['track_id'] || r['Track ID']) row.metadata = { track_id: r['track_id'] || r['Track ID'] };
    return row;
  }
}

export class SaavnSalesParser extends BaseSalesParser {
  constructor() { super('saavn'); }
  protected parseRow(r: Record<string, string>, batchId: string): FactSalesRow | null {
    const isrc = r['ISRC ID'] || r['isrc'] || '';
    if (!isrc) return null;
    const row = this.createBaseRow(batchId);
    row.reporting_period_start = this.normalizeDate(r['Report Date']);
    row.reporting_period_end = this.normalizeDate(r['Report Date']);
    row.service_name = 'JioSaavn';
    row.member_name = r['Member ID'] || '';
    row.label_name = r['Label ID'] || '';
    row.isrc = isrc;
    row.territory_code = this.normalizeCountryCode(r['Territory Code'] || '');
    row.track_title = r['Track Title'] || '';
    row.artist_name = r['Artist'] || '';
    row.album_title = r['Release Title'] || '';
    row.release_id = r['Release ID'] || '';
    row.quantity = this.safeInt(r['Quantity'] || '0');
    const rawUsd = r['Total in USD'] || '0';
    const rawLocal = r['Price Foreign'] || rawUsd;
    const currency = r['DSP Currency'] || 'USD';
    row.revenue_currency = currency;
    row.revenue_local = this.safeDecimal(rawLocal);
    row.revenue_usd = rawUsd !== '0' ? this.safeDecimal(rawUsd) : (currency.toUpperCase() === 'USD' ? this.safeDecimal(rawLocal) : '0');
    row.usage_type = r['Type'] || 'Stream';
    if (r['Adjustments'] && r['Adjustments'] !== '0') row.metadata = { adjustments: r['Adjustments'] };
    return row;
  }
}

export class RythmSalesParser extends BaseSalesParser {
  constructor() { super('rythm'); }
  protected parseRow(r: Record<string, string>, batchId: string): FactSalesRow | null {
    const isrc = r['ISRC'] || '';
    if (!isrc) return null;
    const row = this.createBaseRow(batchId);
    row.reporting_period_start = this.normalizeDate(r['Start_Date']);
    row.reporting_period_end = this.normalizeDate(r['End_Date']);
    row.service_name = r['Service'] || 'Rythm';
    row.dpid = r['DPID'] || '';
    row.member_name = r['Member_Name'] || '';
    row.label_name = r['Label_Name'] || '';
    row.isrc = isrc;
    row.grid = r['GRID'] || '';
    row.territory_code = this.normalizeCountryCode(r['Territory'] || '');
    row.track_title = r['Track_Title'] || '';
    row.artist_name = r['Artist_Name'] || '';
    row.album_title = r['Release_Title'] || '';
    row.release_id = r['Release_ID'] || '';
    row.genre = r['Genre'] || '';
    row.quantity = this.safeInt(r['Quantity'] || '0');
    const rawUsd = r['Total_Payable_USD'] || '0';
    const rawLocal = r['Total_Payable'] || rawUsd;
    const currency = r['Currency'] || 'USD';
    row.revenue_currency = currency;
    row.revenue_local = this.safeDecimal(rawLocal);
    row.revenue_usd = rawUsd !== '0' ? this.safeDecimal(rawUsd) : (currency.toUpperCase() === 'USD' ? this.safeDecimal(rawLocal) : '0');
    row.service_tier = r['Service_Type'] || '';
    return row;
  }
}

export class MixcloudSalesParser extends BaseSalesParser {
  constructor() { super('mixcloud'); }
  protected parseRow(r: Record<string, string>, batchId: string): FactSalesRow | null {
    const isrc = r['ISRC'] || '';
    if (!isrc) return null;
    const row = this.createBaseRow(batchId);
    row.reporting_period_start = this.normalizeDate(r['Start_Date']);
    row.reporting_period_end = this.normalizeDate(r['End_Date']);
    row.service_name = r['Service'] || 'Mixcloud';
    row.dpid = r['DPID'] || '';
    row.member_name = r['Member_Name'] || '';
    row.label_name = r['Label_Name'] || '';
    row.isrc = isrc;
    row.territory_code = this.normalizeCountryCode(r['Country_Of_Sale'] || '');
    row.track_title = r['Track_Title'] || '';
    row.artist_name = r['Artist_Name'] || '';
    row.album_title = r['Release_Title'] || '';
    row.release_id = r['Release_ID'] || '';
    row.genre = r['Genre'] || '';
    row.quantity = this.safeInt(r['Quantity'] || '0');
    const rawUsd = r['Total_Payable_USD'] || r['Total Amount'] || '0';
    const rawLocal = r['Total_Payable'] || rawUsd;
    const currency = r['Base_Currency'] || 'USD';
    row.revenue_currency = currency;
    row.revenue_local = this.safeDecimal(rawLocal);
    row.revenue_usd = rawUsd !== '0' ? this.safeDecimal(rawUsd) : (currency.toUpperCase() === 'USD' ? this.safeDecimal(rawLocal) : '0');
    row.service_tier = r['Service_Type'] || '';
    row.usage_type = r['Type_Of_Play'] || 'Stream';
    if (r['Adjustments'] && r['Adjustments'] !== '0') row.metadata = { adjustments: r['Adjustments'] };
    return row;
  }
}
