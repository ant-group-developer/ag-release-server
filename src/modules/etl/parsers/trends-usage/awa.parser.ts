import { BaseParser } from '../base.parser';
import { FactDspRow } from '../../interfaces';

/**
 * AWA Parser
 * Format: TSV (tab-delimited)
 * Columns: dt, label_no, label_nm, track_nm, isrc, track_product_no,
 *          artist_ex_id, artist_nm, album_disc_no, album_track_no,
 *          album_nm, upc, catalog_no, package_no, sex, age_range,
 *          region_code, play_count, user_type, place_category,
 *          app_place_category, pref_code
 */
export class AwaParser extends BaseParser {
  constructor() {
    super('awa');
  }

  protected parseRow(
    record: Record<string, string>,
    batchId: string,
  ): FactDspRow | null {
    let isrc = record['isrc']?.trim() || '';
    const upc = record['upc']?.trim() || '';
    if (!isrc && !upc) return null;

    if (!isrc && upc) {
      isrc = `UPC-${upc}`;
    }

    const row = this.createBaseRow(batchId);
    row.reporting_period = this.normalizeDate(record['dt']); // YYYYMMDD
    row.isrc = isrc;
    row.territory_code = this.mapAwaRegion(record['region_code']);
    row.track_title = record['track_nm'] || '';
    row.artist_name = record['artist_nm'] || '';
    row.album_title = record['album_nm'] || '';
    row.upc = record['upc'] || '';
    row.partner_id = record['label_no'] || '';
    row.label_name = record['label_nm'] || '';
    row.quantity_total = this.safeInt(record['play_count']);
    row.monetisation_type = (record['user_type'] || '').toUpperCase(); // Paid / Free
    row.usage_type = 'stream';
    row.track_id_internal = record['track_product_no'] || '';

    row.metadata = {
      ...(record['sex'] ? { sex: record['sex'] } : {}),
      ...(record['age_range'] ? { age_range: record['age_range'] } : {}),
      ...(record['place_category'] ? { place_category: record['place_category'] } : {}),
      ...(record['app_place_category'] ? { app_place_category: record['app_place_category'] } : {}),
      ...(record['pref_code'] ? { pref_code: record['pref_code'] } : {}),
    };

    return row;
  }

  /**
   * AWA uses numeric region codes (Japanese prefecture codes).
   * If a code is present (1-47 = Japanese prefecture) → JP.
   * If empty/missing → XX (unknown).
   */
  private mapAwaRegion(code: string): string {
    if (!code || code.trim() === '' || code === '0') return 'XX';
    // Any numeric value = Japanese prefecture → JP
    const num = parseInt(code, 10);
    if (!isNaN(num) && num >= 1) return 'JP';
    return 'XX';
  }
}
