import { BaseParser } from '../base.parser';
import { FactDspRow } from '../../interfaces';

/**
 * TikTok / Douyin Parser
 * Format: TSV (tab-delimited)
 * Files: bombshelter-digital-services-llc_TikTok_YYYYMMDD_Daily-Usage.tsv
 *        bombshelter-digital-services-llc_Douyin_YYYYMMDD_Daily-Usage.tsv
 *
 * Columns: date, platform_name, platform_song_id, isrc, product_code, song_title,
 *          artist, album, label_name, sublabel, label_provided_genre,
 *          platform_classified_genre, territory, content_type, creations,
 *          video_views, comments, likes, shares, favorites, avg_watchtime
 */
export class TiktokParser extends BaseParser {
  constructor() {
    super('tiktok');
  }

  protected parseRow(
    record: Record<string, string>,
    batchId: string,
  ): FactDspRow | null {
    const isrc = record['isrc'];
    if (!isrc) return null;

    const row = this.createBaseRow(batchId);
    row.reporting_period = this.normalizeDate(record['date']); // YYYYMMDD
    row.isrc = isrc;
    row.territory_code = this.normalizeCountryCode(record['territory']);
    row.track_title = record['song_title'] || '';
    row.artist_name = record['artist'] || '';
    row.album_title = record['album'] || '';
    row.label_name = record['label_name'] || '';
    row.upc = record['product_code'] || '';
    row.track_id_internal = record['platform_song_id'] || '';
    row.track_classification = (record['content_type'] || '').toUpperCase(); // UGC / PGC
    row.usage_type = 'social';

    // Primary metric: video_views
    row.quantity_total = this.safeInt(record['video_views']);

    row.metadata = {
      platform_name: record['platform_name'] || '', // TikTok or Douyin
      ...(record['creations'] && record['creations'] !== '0' ? { creations: record['creations'] } : {}),
      ...(record['comments'] && record['comments'] !== '0' ? { comments: record['comments'] } : {}),
      ...(record['likes'] && record['likes'] !== '0' ? { likes: record['likes'] } : {}),
      ...(record['shares'] && record['shares'] !== '0' ? { shares: record['shares'] } : {}),
      ...(record['favorites'] && record['favorites'] !== '0' ? { favorites: record['favorites'] } : {}),
      ...(record['avg_watchtime'] && record['avg_watchtime'] !== '0' ? { avg_watchtime: record['avg_watchtime'] } : {}),
      ...(record['sublabel'] ? { sublabel: record['sublabel'] } : {}),
      ...(record['label_provided_genre'] ? { label_genre: record['label_provided_genre'] } : {}),
      ...(record['platform_classified_genre'] ? { platform_genre: record['platform_classified_genre'] } : {}),
    };

    return row;
  }
}
