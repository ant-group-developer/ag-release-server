import { BaseParser } from '../base.parser';
import { FactDspRow } from '../../interfaces';

/**
 * Audiomack Parser
 * Format: CSV (comma-delimited, quoted fields)
 * Columns: date, subscriber_status, country, music_id, music_title, album,
 *          music_genre, release_date, upc, isrc, reposts, favourites,
 *          downloads, play30s, listeners, member_id, member_name
 */
export class AudiomackParser extends BaseParser {
  constructor() {
    super('audiomack');
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
    row.reporting_period = this.normalizeDate(record['date']);
    row.isrc = isrc;
    row.territory_code = this.normalizeCountryCode(record['country']);
    row.track_title = record['music_title'] || '';
    row.album_title = record['album'] || '';
    row.upc = record['upc'] || '';
    row.partner_id = record['member_id'] || '';
    row.licensor = record['member_name'] || '';
    row.quantity_total = this.safeInt(record['play30s']);
    row.quantity_unique_users = this.safeInt(record['listeners']);
    row.monetisation_type = (record['subscriber_status'] || '').toUpperCase(); // FREE / PREMIUM
    row.usage_type = 'stream';
    row.track_id_internal = record['music_id'] || '';

    row.metadata = {
      ...(record['reposts'] && record['reposts'] !== '0' ? { reposts: record['reposts'] } : {}),
      ...(record['favourites'] && record['favourites'] !== '0' ? { favourites: record['favourites'] } : {}),
      ...(record['downloads'] && record['downloads'] !== '0' ? { downloads: record['downloads'] } : {}),
      ...(record['music_genre'] ? { genre: record['music_genre'] } : {}),
      ...(record['release_date'] ? { release_date: record['release_date'] } : {}),
    };

    return row;
  }
}
