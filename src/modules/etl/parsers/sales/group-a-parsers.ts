import { BaseSalesParser } from './base-sales.parser';
import { FactSalesRow } from '../../interfaces';

export class AudiomackSalesParser extends BaseSalesParser {
  constructor() { super('audiomack'); }
  protected parseRow(r: Record<string, string>, batchId: string): FactSalesRow | null {
    const isrc = r['ISRC'] || r['isrc'];
    if (!isrc) return null;
    const row = this.createBaseRow(batchId);
    row.reporting_period_start = this.normalizeDate(r['Start_Date'] || r['Start Date'], true, 'DMY');
    row.reporting_period_end = this.normalizeDate(r['End_Date'] || r['End Date'], false, 'DMY');
    row.service_name = r['Service'] || '';
    row.dpid = r['DPID'] || '';
    row.member_name = r['Member_Name'] || r['Member Name'] || '';
    row.label_name = r['Label_Name'] || r['Label Name'] || '';
    row.isrc = isrc;
    row.upc = r['UPC'] || '';
    row.grid = r['GRID'] || '';
    row.release_id = r['Release_ID'] || r['Release ID'] || '';
    row.track_title = r['Track_Title'] || r['Track Title'] || '';
    row.artist_name = r['Artist_Name'] || r['Artist Name'] || '';
    row.album_title = r['Release_Title'] || r['Release Title'] || '';
    row.genre = r['Genre'] || '';
    row.territory_code = this.normalizeCountryCode(r['Country'] || '');
    row.quantity = this.safeInt(r['Streams'] || r['Quantity'] || '0');
    const rawLocal = r['Total_Payable'] || r['Total Payable'] || '0';
    const currency = r['Currency'] || 'USD';
    row.revenue_currency = currency;
    row.revenue_local = this.safeDecimal(rawLocal);
    row.revenue_usd = currency.toUpperCase() === 'USD' ? this.safeDecimal(rawLocal) : '0';
    row.service_tier = r['Service_Tier'] || r['Service Tier'] || '';
    row.usage_type = r['Type_Of_Play'] || r['Type of Play'] || 'stream';
    return row;
  }
}

export class JooxSalesParser extends BaseSalesParser {
  constructor() { super('joox'); }
  protected parseRow(r: Record<string, string>, batchId: string): FactSalesRow | null {
    const isrc = r['ISRC'] || '';
    if (!isrc) return null;
    const row = this.createBaseRow(batchId);
    row.reporting_period_start = this.normalizeDate(r['Start_Date']);
    row.reporting_period_end = this.normalizeDate(r['End_Date']);
    row.service_name = r['Service'] || '';
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
    row.release_id = r['Release_ID'] || '';
    row.quantity = this.safeInt(r['Quantity'] || '0');
    const rawUsd = r['Total Amount'] || r['Total_Payable_USD'] || '0';
    const rawLocal = r['Total_Payable'] || rawUsd;
    const currency = r['Currency'] || 'USD';
    row.revenue_currency = currency;
    row.revenue_local = this.safeDecimal(rawLocal);
    row.revenue_usd = rawUsd !== '0' ? this.safeDecimal(rawUsd) : (currency.toUpperCase() === 'USD' ? this.safeDecimal(rawLocal) : '0');
    row.service_tier = r['Service_Tier'] || '';
    row.plan_name = r['Service_Plan'] || '';
    row.usage_type = r['Type_Of_Play'] || 'stream';
    if (r['Adjustments']) row.metadata = { adjustments: r['Adjustments'] };
    return row;
  }
}

export class RessoSalesParser extends BaseSalesParser {
  constructor() { super('resso'); }
  protected parseRow(r: Record<string, string>, batchId: string): FactSalesRow | null {
    const isrc = r['isrc'] || '';
    if (!isrc) return null;
    const row = this.createBaseRow(batchId);
    row.reporting_period_start = this.normalizeDate(r['reporting_period_start']);
    row.reporting_period_end = this.normalizeDate(r['reporting_period_end']);
    row.service_name = r['service_name'] || '';
    row.dpid = r['provider_dpid'] || '';
    row.member_name = r['content_provider'] || '';
    row.label_name = r['label_name'] || '';
    row.isrc = isrc;
    row.upc = r['upc'] || '';
    row.grid = r['grid'] || '';
    row.release_id = r['platform_album_id'] || '';
    row.track_title = r['track_title'] || '';
    row.artist_name = r['artist_name'] || '';
    row.album_title = r['release_title'] || '';
    row.genre = r['genre'] || '';
    row.territory_code = this.normalizeCountryCode(r['country'] || '');
    row.quantity = this.safeInt(r['number_of_streams'] || '0');
    const rawUsd = r['total_payable_usd'] || '0';
    const rawLocal = r['total_payable'] || rawUsd;
    const currency = r['currency'] || 'USD';
    row.revenue_currency = currency;
    row.revenue_local = this.safeDecimal(rawLocal);
    row.revenue_usd = rawUsd !== '0' ? this.safeDecimal(rawUsd) : (currency.toUpperCase() === 'USD' ? this.safeDecimal(rawLocal) : '0');
    row.service_tier = r['service_tier'] || '';
    row.usage_type = 'stream';
    if (r['platform_track_id']) row.metadata = { platform_track_id: r['platform_track_id'] };
    return row;
  }
}

export class TrebelSalesParser extends BaseSalesParser {
  constructor() { super('trebel'); }
  protected parseRow(r: Record<string, string>, batchId: string): FactSalesRow | null {
    const isrc = r['ISRC'] || '';
    if (!isrc) return null;
    const row = this.createBaseRow(batchId);
    row.reporting_period_start = this.normalizeDate(r['Start_Date']);
    row.reporting_period_end = this.normalizeDate(r['End_Date']);
    row.service_name = r['Service'] || '';
    row.dpid = r['Member_DPID'] || '';
    row.member_name = r['Member_Name'] || '';
    row.label_name = r['Label_Name'] || '';
    row.isrc = isrc;
    row.grid = r['GRID'] || '';
    row.genre = r['Genre'] || '';
    row.territory_code = this.normalizeCountryCode(r['Territory'] || '');
    row.track_title = r['Track_Title'] || '';
    row.artist_name = r['Artist_Name'] || '';
    row.album_title = r['Release_Title'] || '';
    row.release_id = r['Release_ID'] || '';
    row.quantity = this.safeInt(r['Quantity'] || '0');
    const rawUsd = r['Total_Payable_USD'] || '0';
    const rawLocal = r['Total_Payable'] || rawUsd;
    const currency = r['Currency'] || 'USD';
    row.revenue_currency = currency;
    row.revenue_local = this.safeDecimal(rawLocal);
    row.revenue_usd = rawUsd !== '0' ? this.safeDecimal(rawUsd) : (currency.toUpperCase() === 'USD' ? this.safeDecimal(rawLocal) : '0');
    row.service_tier = r['Service_Tier'] || '';
    row.usage_type = r['Type_Of_Play'] || '';
    return row;
  }
}

export class TencentSalesParser extends BaseSalesParser {
  constructor() { super('tencent'); }
  protected parseRow(r: Record<string, string>, batchId: string): FactSalesRow | null {
    const isrc = r['ISRC'] || '';
    if (!isrc) return null;
    const row = this.createBaseRow(batchId);
    const dateField = r['Start_Date'] || r['End_Date'] || '';
    row.reporting_period_start = this.normalizeDate(dateField, true);
    row.reporting_period_end = this.normalizeDate(r['End_Date'] || dateField, false);
    row.service_name = r['Service'] || '';
    row.dpid = r['DPID'] || '';
    row.member_name = r['Member_Name'] || '';
    row.label_name = r['Label_Name'] || '';
    row.isrc = isrc;
    row.genre = r['Genre'] || '';
    row.territory_code = this.normalizeCountryCode(r['Country_Of_Sale'] || r['Country'] || '');
    row.track_title = r['Track_Title'] || '';
    row.artist_name = r['Artist_Name'] || '';
    row.album_title = r['Release_Title'] || '';
    row.release_id = r['Release_ID'] || '';
    row.upc = r['Release_ID'] || '';
    row.quantity = this.safeInt(r['Quantity'] || '0');
    const rawUsd = r['Total_Payable_USD'] || r['USD_Amount'] || '0';
    const rawLocal = r['Adjusted_Total_Payable'] || r['Adjusted_total_payable'] || r['Total_Payable'] || rawUsd;
    const currency = r['Statement_Currency'] || r['Currency'] || 'USD';
    row.revenue_currency = currency;
    row.revenue_local = this.safeDecimal(rawLocal);
    row.revenue_usd = rawUsd !== '0' ? this.safeDecimal(rawUsd) : (currency.toUpperCase() === 'USD' ? this.safeDecimal(rawLocal) : '0');
    row.service_tier = r['Service_Type'] || '';
    row.usage_type = r['Type_Of_Play'] || 'stream';
    if (r['Adjustments'] && r['Adjustments'] !== '0') row.metadata = { adjustments: r['Adjustments'] };
    return row;
  }
}

export class TaobaoSalesParser extends BaseSalesParser {
  constructor() { super('taobao'); }
  protected parseRow(r: Record<string, string>, batchId: string): FactSalesRow | null {
    const isrc = r['ISRC'] || '';
    if (!isrc) return null;
    const row = this.createBaseRow(batchId);
    row.reporting_period_start = this.normalizeDate(r['Start_Date']);
    row.reporting_period_end = this.normalizeDate(r['End_Date']);
    row.service_name = r['Service'] || 'Alibaba Taobao';
    row.dpid = r['Member_DPID'] || '';
    row.member_name = r['Member_Name'] || '';
    row.label_name = r['Label_Name'] || '';
    row.isrc = isrc;
    row.genre = r['Genre'] || '';
    row.territory_code = this.normalizeCountryCode(r['Country'] || '');
    row.track_title = r['Track_Title'] || '';
    row.artist_name = r['Artist_Name'] || '';
    row.album_title = r['Release_Title'] || '';
    row.release_id = r['Release_ID'] || '';
    row.quantity = this.safeInt(r['Quantity_Creations'] || r['Quantity'] || '0');
    row.quantity_creations = this.safeInt(r['Quantity_Creations'] || '0');
    const rawUsd = r['Total_Payable_USD'] || '0';
    const rawLocal = r['Adjusted_Total_Payable'] || rawUsd;
    const currency = r['Currency'] || 'USD';
    row.revenue_currency = currency;
    row.revenue_local = this.safeDecimal(rawLocal);
    row.revenue_usd = rawUsd !== '0' ? this.safeDecimal(rawUsd) : (currency.toUpperCase() === 'USD' ? this.safeDecimal(rawLocal) : '0');
    if (r['Adjustments'] && r['Adjustments'] !== '0.0') row.metadata = { adjustments: r['Adjustments'] };
    return row;
  }
}

export class NeteaseSalesParser extends BaseSalesParser {
  constructor() { super('netease'); }
  protected parseRow(r: Record<string, string>, batchId: string): FactSalesRow | null {
    const isrc = r['ISRC'] || '';
    if (!isrc) return null;
    const row = this.createBaseRow(batchId);
    row.reporting_period_start = this.normalizeDate(r['Start_Date']);
    row.reporting_period_end = this.normalizeDate(r['End_Date']);
    row.service_name = r['Service'] || 'Netease Cloud Music';
    row.dpid = r['DPID'] || '';
    row.member_name = r['Member_Name'] || '';
    row.label_name = r['Label_Name'] || '';
    row.isrc = isrc;
    row.territory_code = this.normalizeCountryCode(r['Country_Of_Sale'] || '');
    row.track_title = r['Track_Title'] || '';
    row.artist_name = r['Artist_Name'] || '';
    row.album_title = r['Release_Title'] || '';
    row.release_id = r['Release_ID'] || '';
    // Note: header has a space: "Quantity_ Streams"
    row.quantity = this.safeInt(r['Quantity_ Streams'] || r['Quantity_Streams'] || '0');
    const rawUsd = r['USD_Amount'] || '0';
    const rawLocal = r['Total_Payable'] || rawUsd;
    const currency = r['Statement_Currency'] || 'CNY';
    row.revenue_currency = currency;
    row.revenue_local = this.safeDecimal(rawLocal);
    row.revenue_usd = rawUsd !== '0' ? this.safeDecimal(rawUsd) : (currency.toUpperCase() === 'USD' ? this.safeDecimal(rawLocal) : '0');
    row.service_tier = r['Service_Type'] || '';
    row.usage_type = 'stream';
    const cachePlays = r['Quantity_ Cache_ Plays'] || r['Quantity_Cache_Plays'] || '';
    if (cachePlays && cachePlays !== '0') row.metadata = { cache_plays: cachePlays };
    return row;
  }
}

export class SoundtrackSalesParser extends BaseSalesParser {
  constructor() { super('soundtrack-your-brand'); }
  protected parseRow(r: Record<string, string>, batchId: string): FactSalesRow | null {
    const isrc = r['ISRC'] || '';
    if (!isrc) return null;
    const row = this.createBaseRow(batchId);
    row.reporting_period_start = this.normalizeDate(r['Start_Date']);
    row.reporting_period_end = this.normalizeDate(r['End_Date']);
    row.service_name = r['Partner'] || 'Soundtrack Your Brand';
    row.dpid = r['DPID'] || '';
    row.member_name = r['Label_Group_Name'] || '';
    row.label_name = r['Label_Name'] || '';
    row.isrc = isrc;
    row.upc = r['UPC'] || '';
    row.territory_code = this.normalizeCountryCode(r['Country_Of_Sale'] || '');
    row.track_title = r['Track_Title'] || '';
    row.artist_name = r['Track_Artist'] || '';
    row.album_title = r['Album_Title'] || '';
    row.quantity = this.safeInt(r['Number_Of_Transactions'] || '0');
    const rawLocal = r['Statement_Amount'] || '0';
    const currency = r['Statement_Currency'] || 'USD';
    row.revenue_currency = currency;
    row.revenue_local = this.safeDecimal(rawLocal);
    row.revenue_usd = currency.toUpperCase() === 'USD' ? this.safeDecimal(rawLocal) : '0';
    row.service_tier = r['Subscription_Type'] || '';
    row.usage_type = 'stream';
    if (r['Sales_Channel']) row.metadata = { sales_channel: r['Sales_Channel'] };
    return row;
  }
}

export class KkboxSalesParser extends BaseSalesParser {
  constructor() { super('kkbox'); }
  protected parseRow(r: Record<string, string>, batchId: string): FactSalesRow | null {
    const isrc = r['ISRC'] || '';
    if (!isrc) return null;
    const row = this.createBaseRow(batchId);
    row.reporting_period_start = this.normalizeDate(r['Date']);
    row.reporting_period_end = this.normalizeDate(r['Date']);
    row.service_name = r['Service'] || 'KKBox';
    row.dpid = r['DPID'] || '';
    row.member_name = r['Content Provider'] || '';
    row.label_name = r['Label'] || '';
    row.isrc = isrc;
    row.upc = r['UPC'] || '';
    row.territory_code = this.normalizeCountryCode(r['Territory'] || '');
    row.track_title = r['Track Name'] || '';
    row.artist_name = r['Artist Name'] || '';
    row.album_title = r['Album Name'] || '';
    row.genre = r['Genre'] || '';
    row.quantity = this.safeInt(r['Number of Transaction'] || '0');
    const rawUsd = r['USD Payable'] || '0';
    const rawLocal = r['Net Royalty Total'] || rawUsd;
    const currency = r['Currency'] || 'TWD';
    row.revenue_currency = currency;
    row.revenue_local = this.safeDecimal(rawLocal);
    row.revenue_usd = rawUsd !== '0' ? this.safeDecimal(rawUsd) : (currency.toUpperCase() === 'USD' ? this.safeDecimal(rawLocal) : '0');
    row.service_tier = r['Service Type'] || '';
    row.usage_type = r['Type'] || '';
    return row;
  }
}
