import * as path from 'path';
import { BaseParser } from '../base.parser';
import { FactDspRow } from '../../interfaces';

/**
 * Parser for NetEase Cloud Music (NCM) trend data.
 *
 * File format: TSV (inside .zip)
 * Headers: Report Date, Start Date, End Date, Service, Title, Album,
 *          Label, Merlin Member, DPID, UPC, ISRC, Streams Last 7 Days, Downloads
 */
export class NeteaseParser extends BaseParser {
  constructor() {
    super('netease');
  }

  protected parseRow(
    record: Record<string, string>,
    batchId: string,
    filePath: string,
  ): FactDspRow | null {
    let isrc = record['ISRC']?.trim() || '';
    const upc = record['UPC']?.trim() || '';
    const streams = this.safeInt(record['Streams Last 7 Days']);
    const downloads = this.safeInt(record['Downloads']);

    if ((!isrc && !upc) || (streams === 0 && downloads === 0)) return null;

    if (!isrc && upc) {
      isrc = `UPC-${upc}`;
    }

    // Use Start Date as reporting period, fallback to Report Date, then filename
    const reportDate =
      record['Start Date'] || record['Report Date'] || '';

    const row = this.createBaseRow(batchId);
    row.reporting_period = reportDate
      ? this.normalizeDate(reportDate)
      : this.extractDateFromFilename(filePath);
    row.isrc = isrc;
    row.upc = record['UPC'] || '';
    row.track_title = record['Title'] || '';
    row.album_title = record['Album'] || '';
    row.label_name = record['Label'] || '';
    row.partner_id = record['DPID'] || '';
    row.licensor = record['Merlin Member'] || '';
    row.quantity_total = streams + downloads;
    row.usage_type = streams > 0 ? 'STREAM' : 'DOWNLOAD';

    row.metadata = {
      service: record['Service'] || 'NETEASE',
      streams: String(streams),
      downloads: String(downloads),
      start_date: record['Start Date'] || '',
      end_date: record['End Date'] || '',
    };

    return row;
  }
}
