import { BaseParser } from '../base.parser';
import { FactDspRow } from '../../interfaces';
import * as path from 'path';

/**
 * Snap (Snapchat) Parser
 * Format: CSV (comma-delimited, quoted fields)
 * Two file types:
 *   - TRANS: _SNAP_CC_MERLIN_TRANS_YYYYMMDD.csv → Messages Created (creations)
 *   - VIEWS: _SNAP_CC_MERLIN_TRANS_YYYYMMDD_VIEWS.csv → Messages Viewed (views)
 *
 * Columns: Provider_Key, ReportStartDate, Report_End_Date, Stream_Date,
 *          Country_Key, ISRC, Track_Title, Track_Artist, DDEX_Party_Id,
 *          Merlin_Member_Name, Label_Name, releaseDate,
 *          Number_of_Label_Library_Messages_Created (TRANS)
 *          Number_of_Label_Library_Messages_Viewed (VIEWS)
 */
export class SnapParser extends BaseParser {
  constructor() {
    super('snap');
  }

  protected parseRow(
    record: Record<string, string>,
    batchId: string,
    filePath: string,
  ): FactDspRow | null {
    const isrc = record['ISRC'];
    if (!isrc) return null;

    const isViews = path.basename(filePath).includes('_VIEWS');

    const row = this.createBaseRow(batchId);
    // Use ReportStartDate (not Stream_Date) for reporting period
    row.reporting_period = this.normalizeDate(record['ReportStartDate'] || record['Report_End_Date']);
    row.isrc = isrc;
    row.territory_code = this.normalizeCountryCode(record['Country_Key']);
    row.track_title = record['Track_Title'] || '';
    row.artist_name = record['Track_Artist'] || '';
    row.label_name = record['Label_Name'] || '';
    row.partner_id = record['DDEX_Party_Id'] || '';
    row.licensor = record['Merlin_Member_Name'] || '';

    if (isViews) {
      row.quantity_total = this.safeInt(record['Number_of_Label_Library_Messages_Viewed']);
      row.usage_type = 'view';
    } else {
      row.quantity_total = this.safeInt(record['Number_of_Label_Library_Messages_Created']);
      row.usage_type = 'creation';
    }

    row.metadata = {
      ...(record['releaseDate'] ? { release_date: record['releaseDate'] } : {}),
      snap_type: isViews ? 'views' : 'creations',
    };

    return row;
  }
}
