import { ICoverArtThumbnails } from 'src/modules/release/interfaces/release.interface';

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
  revenueUsd?: number;
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
  revenueUsd?: number;
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
// Revenue Analytics (POST /analytics/revenue/*)
// ═══════════════════════════════════════════════════════

export interface RevenueOverviewResponse {
  /** Tổng doanh thu quy đổi USD trong khoảng thời gian */
  totalRevenueUsd: number;
  /** Tổng lượt nghe */
  totalQuantity: number;
  /** Tổng số vùng lãnh thổ (quốc gia) phát sinh doanh thu */
  totalTerritories: number;
}

export interface RevenueDspItem {
  dspName: string;
  revenueUsd: number;
  quantity: number;
}

export type RevenueTopDspResponse = RevenueDspItem[];

export interface RevenueTimelineDspItem {
  dsp: string;
  revenueUsd: number;
  quantity: number;
}

export interface RevenueTimelinePeriod {
  period: string;  // 'YYYY-MM'
  revenueUsd: number;
  quantity: number;
  series: RevenueTimelineDspItem[];
}

export interface RevenueTimelineResponse {
  topDsps: string[];
  items: RevenueTimelinePeriod[];
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
  release: {
    coverArtThumbnails: ICoverArtThumbnails;
  } | null;
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
  release: {
    coverArtThumbnails: ICoverArtThumbnails;
  } | null;
}

export interface ArtistRankingItem {
  rank: number;
  artistId: string;
  artistName: string;
  picture: string | null;
  image: string | null;
  trackCount: number;
  totalViews: number;
}

export interface LabelRankingItem {
  rank: number;
  labelId: string;
  labelName: string;
  picture: string | null;
  image: string | null;
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

// ═══════════════════════════════════════════════════════
// Revenue Top Artist & Track (POST /analytics/revenue/top-*)
// ═══════════════════════════════════════════════════════

export interface RevenueArtistItem {
  rank: number;
  artistId: string;
  artistName: string;
  picture: string | null;
  trackCount: number;
  revenueUsd: number;
  quantity: number;
}

export type RevenueTopArtistResponse = RevenueArtistItem[];

export interface RevenueTrackItem {
  rank: number;
  isrc: string;
  title: string;
  version: string | null;
  artistName: string;
  releaseId: string | null;
  releaseTitle: string | null;
  revenueUsd: number;
  quantity: number;
}

export type RevenueTopTrackResponse = RevenueTrackItem[];

export interface EntityOverviewResponse {
  totalTrendViews: number;   // tổng lượt stream trend trong kỳ
  totalSalesViews: number;   // tổng lượt nghe sales trong kỳ
  totalRevenueUsd: number;   // tổng doanh thu USD trong kỳ
}

export interface RevenueLabelItem {
  rank: number;
  labelId: string;
  labelName: string;
  picture: string | null;
  releaseCount?: number;
  trackCount?: number;
  revenueUsd: number;
  quantity: number;
}

export interface RevenueTenantItem {
  rank: number;
  tenantId: string;
  tenantName: string;
  logo: string | null;
  revenueUsd: number;
  quantity: number;
}

export interface OverviewTrendsResponse {
  totalViews: number;
  totalDsps: number;
  totalTracks: number;
  totalArtists: number;
  totalLabels: number;
}

export interface TenantRankingItem {
  rank: number;
  tenantId: string;
  tenantName: string;
  logo: string | null;
  totalViews: number;
}

export interface DspRankingItem {
  rank: number;
  dspId: string;
  dspName: string;
  totalViews: number;
}

export interface RevenueReleaseItem {
  rank: number;
  releaseId: string;
  title: string;
  upc: string | null;
  labelId: string | null;
  labelName: string | null;
  trackCount: number;
  revenueUsd: number;
  quantity: number;
  release: {
    coverArtThumbnails: ICoverArtThumbnails;
  } | null;
}

// ═══════════════════════════════════════════════════════
// Chart APIs (line-chart / bar-chart)
// ═══════════════════════════════════════════════════════

/** Một điểm trên line-chart trend-view theo tháng */
export interface TrendViewLineChartItem {
  period: string; // 'YYYY-MM'
  totalViews: number;
}

/** Một cột trong bar-chart DSP (top 5 + Other) */
export interface DspBarChartItem {
  dspName: string;
  totalViews?: number;
  revenueUsd?: number;
}

/** Một điểm trên line-chart revenue theo tháng */
export interface TerritoryBarChartItem {
  territory: string;
  totalViews?: number;
  revenueUsd?: number;
}

export interface RevenueLineChartItem {
  period: string; // 'YYYY-MM'
  revenueUsd: number;
  quantity: number;
}
