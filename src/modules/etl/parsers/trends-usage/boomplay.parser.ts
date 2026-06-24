import { BaseParser } from '../base.parser';
import { FactDspRow } from '../../interfaces';

/**
 * Boomplay Parser
 * Format: TSV (tab-delimited)
 * Note: Each row = 1 individual play event (quantity_total = 1 per row).
 *       We aggregate rows by (date, isrc, country, gender, age, service_type)
 *       to reduce row count in ClickHouse.
 *
 * Columns: report_date, service, member_id, merlin_member, song_id, title,
 *          album, label, platform_classified_genre, release_date, upc, isrc,
 *          country, gender, age, service_type, datestamp, playlist_id,
 *          playlist, device
 */
export class BoomplayParser extends BaseParser {
  constructor() {
    super('boomplay');
  }

  /**
   * Override parseFile to aggregate individual play events.
   */
  async parseFile(filePath: string, batchId: string): Promise<FactDspRow[]> {
    const rawRows = await super.parseFile(filePath, batchId);

    // Aggregate by (reporting_period, isrc, territory_code, monetisation_type, gender, age)
    const aggregated = new Map<string, FactDspRow>();

    for (const row of rawRows) {
      const gender = row.metadata['gender'] || '';
      const age = row.metadata['age'] || '';
      const key = `${row.reporting_period}|${row.isrc}|${row.territory_code}|${row.monetisation_type}|${gender}|${age}`;

      if (aggregated.has(key)) {
        const existing = aggregated.get(key)!;
        existing.quantity_total += row.quantity_total;
      } else {
        aggregated.set(key, { ...row });
      }
    }

    return Array.from(aggregated.values());
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
    // Boomplay date format: DD/MM/YYYY
    row.reporting_period = this.normalizeDate(record['report_date']);
    row.isrc = isrc;
    row.territory_code = this.normalizeCountryCode(record['country']);
    row.track_title = record['title'] || '';
    row.album_title = record['album'] || '';
    row.upc = record['upc'] || '';
    row.label_name = record['label'] || '';
    row.partner_id = record['member_id'] || '';
    row.licensor = record['merlin_member'] || '';
    row.quantity_total = 1; // Each row = 1 play event
    row.monetisation_type = (record['service_type'] || '').toUpperCase(); // Free / Premium
    row.usage_type = 'stream';
    row.track_id_internal = record['song_id'] || '';

    row.metadata = {
      ...(record['gender'] && record['gender'] !== 'Unknown' ? { gender: record['gender'] } : {}),
      ...(record['age'] && record['age'] !== 'Unknown' ? { age: record['age'] } : {}),
      ...(record['device'] ? { device: record['device'] } : {}),
      ...(record['platform_classified_genre'] ? { genre: record['platform_classified_genre'] } : {}),
      ...(record['playlist'] ? { playlist: record['playlist'] } : {}),
      ...(record['release_date'] ? { release_date: record['release_date'] } : {}),
    };

    return row;
  }
}
