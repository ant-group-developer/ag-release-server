/**
 * Analytics API response interfaces & types.
 * Tất cả metadata (track, release, artist, label) lấy từ PostgreSQL.
 * Chỉ metrics (views) lấy từ ClickHouse.
 *
 * Response format:
 * - DSP Timeline: ResponseSuccess<DspTimelineResponse>
 * - Rankings: ResponseSuccess<PageDto<*RankingItem>>
 */

// ═══════════════════════════════════════════════════════
// Timelines (DSP and Territory)
// ═══════════════════════════════════════════════════════

export interface DspTimelineSeriesItem {
  dsp: string;
  salesViews?: number;
  trendViews?: number;
}

export interface DspTimelinePeriod {
  period: string; // 'YYYY-MM'
  series: DspTimelineSeriesItem[];
}

export interface DspTimelineResponse {
  topDsps: string[];
  items: DspTimelinePeriod[];
}

export interface TerTimelineSeriesItem {
  territory: string;  // ISO country code (e.g. 'US', 'VN')
  salesViews?: number;
  trendViews?: number;
}

export interface TerTimelinePeriod {
  period: string; // 'YYYY-MM'
  series: TerTimelineSeriesItem[];
}

export interface TerTimelineResponse {
  topTerritories: string[];
  items: TerTimelinePeriod[];
}

// ═══════════════════════════════════════════════════════
// Rankings (API 2-5 — Trends data)
// Paginated bằng PageDto<T> (page/pageSize/totalItems/totalPages)
// ═══════════════════════════════════════════════════════

export interface TrackRankingItem {
  rank: number;
  isrc: string;
  title: string;
  version: string | null;
  artistName: string;
  releaseId: string;
  releaseTitle: string;
  totalViews: number;
}

export interface ReleaseRankingItem {
  rank: number;
  releaseId: string;
  title: string;
  upc: string | null;
  labelId: string | null;
  labelName: string | null;
  trackCount: number;
  totalViews: number;
}

export interface ArtistRankingItem {
  rank: number;
  artistId: string;
  artistName: string;
  picture: string | null;
  trackCount: number;
  totalViews: number;
}

export interface LabelRankingItem {
  rank: number;
  labelId: string;
  labelName: string;
  picture: string | null;
  releaseCount: number;
  trackCount: number;
  totalViews: number;
}

// ═══════════════════════════════════════════════════════
// Internal types used by services
// ═══════════════════════════════════════════════════════

/** ClickHouse row: ISRC with aggregated views */
export interface IsrcViewsRow {
  isrc: string;
  totalViews: string; // ClickHouse returns UInt64 as string
}

/** PostgreSQL: Track metadata for enrichment */
export interface TrackMetadata {
  isrc: string;
  trackTitle: string;
  trackVersion: string | null;
  releaseId: string;
  releaseTitle: string;
  releaseUpc: string | null;
  labelId: string | null;
  labelName: string | null;
}

/** PostgreSQL: ISRC to Artist mapping */
export interface IsrcArtistMapping {
  isrc: string;
  artistId: string;
  artistName: string;
  artistPicture: string | null;
}
