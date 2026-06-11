import { BaseParser } from '../base.parser';
import { FactDspRow } from '../../interfaces';
import * as path from 'path';

/**
 * Vevo / YouTube Parser
 * Format: TSV (tab-delimited)
 * 3 file types per day — all measure the same video views but sliced by different dimensions:
 *
 *   - devices:           views × (country, device)       → PRIMARY source for view counts
 *   - user_attributes:   views_estimate × (country, gender, age_group) → demographic breakdown only
 *   - user_interactions: views × (country) + likes/dislikes/shares    → social metrics only
 *
 * Strategy: Only `devices` contributes to quantity_total (view count).
 * `user_attributes` and `user_interactions` store their metrics in metadata
 * with quantity_total = 0 to prevent triple-counting views.
 *
 * Evidence (2026-04 data):
 *   devices total=16,462  |  user_attr total=15,893  |  user_int total=16,314
 *   All 3 measure the same views — importing all 3 would triple-count.
 */
export class VevoParser extends BaseParser {
  constructor() {
    super('vevo');
  }

  protected parseRow(
    record: Record<string, string>,
    batchId: string,
    filePath: string,
  ): FactDspRow | null {
    const isrc = record['isrc'];
    if (!isrc) return null;

    const basename = path.basename(filePath);

    if (basename.includes('_devices_')) {
      return this.parseDevices(record, batchId);
    }
    if (basename.includes('_user_attributes_')) {
      return this.parseUserAttributes(record, batchId);
    }
    if (basename.includes('_user_interactions_')) {
      return this.parseUserInteractions(record, batchId);
    }

    return null;
  }

  /**
   * devices: PRIMARY source for view counts.
   * Each row = views for (ISRC, country, device).
   * quantity_total = views (the actual count).
   */
  private parseDevices(record: Record<string, string>, batchId: string): FactDspRow | null {
    const row = this.createBaseRow(batchId);
    row.reporting_period = this.normalizeDate(record['date'] || record['view_date']);
    row.isrc = record['isrc'];
    row.territory_code = this.normalizeCountryCode(record['country']);
    row.track_title = record['track_name'] || '';
    row.artist_name = record['artist_name'] || '';
    row.label_name = record['label'] || '';
    row.licensor = record['member_name'] || '';
    row.upc = record['upc'] || '';
    row.partner_id = record['dpid'] || '';
    row.quantity_total = this.safeInt(record['views']);
    row.usage_type = 'view';

    row.metadata = {
      sub_type: 'devices',
      ...(record['device'] ? { device: record['device'] } : {}),
      ...(record['genre'] ? { genre: record['genre'] } : {}),
      ...(record['video_length'] ? { video_length: record['video_length'] } : {}),
      ...(record['avg_watchtime'] ? { avg_watchtime: record['avg_watchtime'] } : {}),
      ...(record['view_length_total'] ? { view_length_total: record['view_length_total'] } : {}),
      ...(record['views_last_7_days'] ? { views_last_7_days: record['views_last_7_days'] } : {}),
      ...(record['platform'] ? { platform: record['platform'] } : {}),
    };

    return row;
  }

  /**
   * user_attributes: Demographic breakdown only.
   * quantity_total = 0 to avoid double-counting views.
   * views_estimate stored in metadata for reference.
   */
  private parseUserAttributes(record: Record<string, string>, batchId: string): FactDspRow | null {
    const viewsEstimate = this.safeInt(record['views_estimate']);
    if (viewsEstimate === 0) return null; // skip empty demographic rows

    const row = this.createBaseRow(batchId);
    row.reporting_period = this.normalizeDate(record['date'] || record['view_date']);
    row.isrc = record['isrc'];
    row.territory_code = this.normalizeCountryCode(record['country']);
    row.track_title = record['track_name'] || '';
    row.artist_name = record['artist_name'] || '';
    row.label_name = record['label'] || '';
    row.licensor = record['member_name'] || '';
    row.upc = record['upc'] || '';
    row.partner_id = record['dpid'] || '';
    row.quantity_total = 0; // DO NOT count views — devices is the primary source
    row.usage_type = 'view_demo';

    row.metadata = {
      sub_type: 'user_attributes',
      views_estimate: String(viewsEstimate),
      ...(record['gender'] ? { gender: record['gender'] } : {}),
      ...(record['age_group'] ? { age_group: record['age_group'] } : {}),
      ...(record['genre'] ? { genre: record['genre'] } : {}),
      ...(record['views_estimate_last_7_days'] ? { views_last_7_days: record['views_estimate_last_7_days'] } : {}),
      ...(record['platform'] ? { platform: record['platform'] } : {}),
    };

    return row;
  }

  /**
   * user_interactions: Social metrics only (likes, dislikes, shares).
   * quantity_total = 0 to avoid double-counting views.
   * views stored in metadata for reference.
   */
  private parseUserInteractions(record: Record<string, string>, batchId: string): FactDspRow | null {
    const row = this.createBaseRow(batchId);
    row.reporting_period = this.normalizeDate(record['date'] || record['view_date']);
    row.isrc = record['isrc'];
    row.territory_code = this.normalizeCountryCode(record['country']);
    row.track_title = record['track_name'] || '';
    row.artist_name = record['artist_name'] || '';
    row.label_name = record['label'] || '';
    row.licensor = record['member_name'] || '';
    row.upc = record['upc'] || '';
    row.partner_id = record['dpid'] || '';
    row.quantity_total = 0; // DO NOT count views — devices is the primary source
    row.usage_type = 'view_social';

    row.metadata = {
      sub_type: 'user_interactions',
      views: record['views'] || '0',
      ...(record['likes'] && record['likes'] !== '0' ? { likes: record['likes'] } : {}),
      ...(record['dislikes'] && record['dislikes'] !== '0' ? { dislikes: record['dislikes'] } : {}),
      ...(record['shares'] && record['shares'] !== '0' ? { shares: record['shares'] } : {}),
      ...(record['avg_watchtime'] ? { avg_watchtime: record['avg_watchtime'] } : {}),
      ...(record['view_length_total'] ? { view_length_total: record['view_length_total'] } : {}),
      ...(record['views_last_7_days'] ? { views_last_7_days: record['views_last_7_days'] } : {}),
      ...(record['genre'] ? { genre: record['genre'] } : {}),
      ...(record['platform'] ? { platform: record['platform'] } : {}),
    };

    return row;
  }
}
