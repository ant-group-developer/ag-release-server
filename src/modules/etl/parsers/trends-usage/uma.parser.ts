import { BaseParser } from '../base.parser';
import { FactDspRow } from '../../interfaces';

/**
 * UMA Parser (VK Music)
 * Format: CSV (comma-delimited, quoted fields)
 *
 * Columns: reporting_start_date, reporting_end_date, isrc, artist, track_title,
 *          album_name, upc, number_of_plays, label_name, service_name,
 *          user_product, track_length, play_percentage, cached_play,
 *          shuffle_play_on, repeat_play_on, source_of_stream, playlist_id,
 *          playlist_name, user_id, user_country, gender, demo_bucket,
 *          device_type, operating_system
 */
export class UmaParser extends BaseParser {
  constructor() {
    super('uma');
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
    row.reporting_period = this.normalizeDate(record['reporting_start_date']);
    row.isrc = isrc;
    row.territory_code = this.normalizeCountryCode(record['user_country']);
    row.track_title = record['track_title'] || '';
    row.artist_name = record['artist'] || '';
    row.album_title = record['album_name'] || '';
    row.upc = record['upc'] || '';
    row.label_name = record['label_name'] || '';
    row.quantity_total = this.safeInt(record['number_of_plays']);
    row.monetisation_type = (record['user_product'] || '').toUpperCase(); // adv/paid
    row.usage_type = 'stream';
    row.account_identifier = record['service_name'] || ''; // VK

    row.metadata = {
      ...(record['gender'] && record['gender'] !== 'N/A' ? { gender: record['gender'] } : {}),
      ...(record['demo_bucket'] && record['demo_bucket'] !== 'N/A' ? { age_bucket: record['demo_bucket'] } : {}),
      ...(record['device_type'] ? { device_type: record['device_type'] } : {}),
      ...(record['operating_system'] ? { os: record['operating_system'] } : {}),
      ...(record['play_percentage'] ? { play_percentage: record['play_percentage'] } : {}),
      ...(record['source_of_stream'] ? { source: record['source_of_stream'] } : {}),
      ...(record['shuffle_play_on'] === '1' ? { shuffle: '1' } : {}),
      ...(record['repeat_play_on'] === 'on' ? { repeat: '1' } : {}),
      ...(record['cached_play'] === '1' ? { cached: '1' } : {}),
    };

    return row;
  }
}
