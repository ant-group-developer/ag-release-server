import { ICoverArtThumbnails } from 'src/modules/release/interfaces/release.interface';

/**
 * Analytics API response interfaces & types.
 * Tất cả metadata (track, release, artist, label) lấy từ PostgreSQL.
 * Chỉ metrics (views) lấy từ ClickHouse.
 *
 * Response format:
 * - Rankings: ResponseSuccess<PageDto<*RankingItem>>
 */

/** Một phần tử trong breakdown theo import_source (groupBySource=true) */
export interface SourceBreakdownItem {
	source: string; // raw value: 'ftp', 'wmg_report', 'spotify_report', ...
	sourceLabel: string; // human-readable: 'Merlin', 'WMG', 'Spotify', ...
	quantity: number;
	revenueUsd?: number;
	revenueUsdExact?: string;
}

// ═══════════════════════════════════════════════════════
// Timelines (DSP and Territory)
// ═══════════════════════════════════════════════════════

export interface AnalyticsWorkspaceInfo {
	id: string;
	name: string;
	title: string;
	logo: string | null;
}

export interface AnalyticsChannelInfo {
	id: string;
	name: string;
	thumbUrl: string | null;
	youtubeChannelId: string | null;
	tenant: AnalyticsWorkspaceInfo | null;
}

export interface AnalyticsVideoInfo {
	id: string;
	releaseId: string;
	isrc: string | null;
	externalId: string | null;
	label: string | null;
	explicit: boolean | null;
	aiContent: string | null;
	channelId: string | null;
	description: string | null;
	keywords: string[] | null;
	madeForKids: string | null;
	visibility: string | null;
	contentProvider: string | null;
	copyrightOwner: string | null;
	partnerCustomId1: string | null;
	partnerCustomId2: string | null;
	fileId: string | null;
	youtubeMatchStatus: string | null;
	youtubeMatchScannedAt: Date | null;
}

export interface RevenueOverviewResponse {
	/** Tổng doanh thu quy đổi USD trong khoảng thời gian */
	totalRevenueUsd: number;
	totalRevenueUsdExact?: string;
	/** Tổng lượt nghe */
	totalQuantity: number;
	/** Tổng số vùng lãnh thổ (quốc gia) phát sinh doanh thu */
	totalTerritories: number;
}

export interface RevenueDspItem {
	pgDspId: string | null;
	dspReportId: string;
	dspName: string;
	revenueUsd: number;
	revenueUsdExact?: string;
	quantity: number;
	bySource?: SourceBreakdownItem[];
}

export type RevenueTopDspResponse = RevenueDspItem[];

export interface TrackRankingItem {
	rank: number;
	isrc: string;
	title: string;
	version: string | null;
	artistName: string;
	releaseId: string;
	releaseTitle: string;
	labelId: string | null;
	labelName: string | null;
	totalViews: number;
	metadataExternal: Record<string, unknown>;
	workspaces: AnalyticsWorkspaceInfo[];
	bySource?: SourceBreakdownItem[];
	release: {
		coverArtThumbnails: ICoverArtThumbnails;
		metadataExternal: Record<string, unknown>;
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
	metadataExternal: Record<string, unknown>;
	workspaces: AnalyticsWorkspaceInfo[];
	bySource?: SourceBreakdownItem[];
	release: {
		coverArtThumbnails: ICoverArtThumbnails;
	} | null;
}

export interface ReleaseRankingVideoItem {
	rank: number;
	releaseId: string;
	title: string;
	upc: string | null;
	labelId: string | null;
	labelName: string | null;
	trackCount: number;
	totalViews: number;
	channels: AnalyticsChannelInfo[];
	workspaces: AnalyticsWorkspaceInfo[];
	video: AnalyticsVideoInfo | null;
	bySource?: SourceBreakdownItem[];
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
	profiles: Array<{ dspCode: string; dspName: string; url: string }>;
	country: string | null;
	genre: string | null;
	trackCount: number;
	totalViews: number;
	bySource?: SourceBreakdownItem[];
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
	bySource?: SourceBreakdownItem[];
	tenant?: {
		id: string;
		name: string;
		title: string;
		logo: string | null;
	} | null;
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
	profiles: Array<{ dspCode: string; dspName: string; url: string }>;
	country: string | null;
	genre: string | null;
	trackCount: number;
	revenueUsd: number;
	revenueUsdExact?: string;
	quantity: number;
	bySource?: SourceBreakdownItem[];
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
	labelId: string | null;
	labelName: string | null;
	revenueUsd: number;
	revenueUsdExact?: string;
	quantity: number;
	metadataExternal: Record<string, unknown>;
	workspaces: AnalyticsWorkspaceInfo[];
	bySource?: SourceBreakdownItem[];
	release: {
		metadataExternal: Record<string, unknown>;
	} | null;
}

export type RevenueTopTrackResponse = RevenueTrackItem[];

export interface EntityOverviewResponse {
	totalTrendViews: number; // tổng lượt stream trend trong kỳ
	totalSalesViews: number; // tổng lượt nghe sales trong kỳ
	totalRevenueUsd: number; // tổng doanh thu USD trong kỳ
	totalRevenueUsdExact?: string;
	artist?: {
		id: string;
		name: string;
		picture: string | null;
		profiles: Array<{ dspCode: string; dspName: string; url: string }>;
		country: string | null;
		genre: string | null;
	} | null;
	tenant?: {
		id: string;
		name: string;
		title: string;
		logo: string | null;
	} | null;
}

/** Unified response for the new analytics summary endpoints. */
export interface AnalyticsSummaryResponse {
	totalTrendViews: number;
	totalUsage: number;
	totalRevenueUsd: number;
	totalRevenueUsdExact: string;
}

export interface RevenueLabelItem {
	rank: number;
	labelId: string;
	labelName: string;
	picture: string | null;
	releaseCount?: number;
	trackCount?: number;
	revenueUsd: number;
	revenueUsdExact?: string;
	quantity: number;
	bySource?: SourceBreakdownItem[];
	tenant?: {
		id: string;
		name: string;
		title: string;
		logo: string | null;
	} | null;
}

export interface RevenueTenantItem {
	rank: number;
	tenantId: string;
	tenantName: string;
	logo: string | null;
	type: string | null;
	revenueUsd: number;
	revenueUsdExact?: string;
	quantity: number;
	bySource?: SourceBreakdownItem[];
}

export interface ChannelRankingItem {
	rank: number;
	channelId: string;
	channelName: string;
	thumbUrl: string | null;
	youtubeChannelId: string | null;
	releaseCount: number;
	trackCount: number;
	totalViews: number;
	bySource?: SourceBreakdownItem[];
	tenant?: {
		id: string;
		name: string;
		title: string;
		logo: string | null;
	} | null;
}

export interface RevenueChannelItem {
	rank: number;
	channelId: string;
	channelName: string;
	thumbUrl: string | null;
	youtubeChannelId: string | null;
	releaseCount?: number;
	trackCount?: number;
	revenueUsd: number;
	revenueUsdExact?: string;
	quantity: number;
	bySource?: SourceBreakdownItem[];
	tenant?: {
		id: string;
		name: string;
		title: string;
		logo: string | null;
	} | null;
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
	type: string | null;
	totalViews: number;
	bySource?: SourceBreakdownItem[];
}

export interface DspRankingItem {
	rank: number;
	pgDspId: string | null;
	dspReportId: string;
	dspName: string;
	totalViews: number;
	bySource?: SourceBreakdownItem[];
}

export interface SourceTypeRankingItem {
	rank: number;
	sourceType: string;
	sourceTypeLabel: string;
	totalViews: number;
}

export interface RevenueSourceTypeItem {
	rank: number;
	sourceType: string;
	sourceTypeLabel: string;
	revenueUsd: number;
	revenueUsdExact?: string;
	quantity: number;
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
	revenueUsdExact?: string;
	quantity: number;
	metadataExternal: Record<string, unknown>;
	workspaces: AnalyticsWorkspaceInfo[];
	bySource?: SourceBreakdownItem[];
	release: {
		coverArtThumbnails: ICoverArtThumbnails;
	} | null;
}

export interface RevenueReleaseVideoItem {
	rank: number;
	releaseId: string;
	title: string;
	upc: string | null;
	labelId: string | null;
	labelName: string | null;
	trackCount: number;
	revenueUsd: number;
	revenueUsdExact?: string;
	quantity: number;
	channels: AnalyticsChannelInfo[];
	workspaces: AnalyticsWorkspaceInfo[];
	video: AnalyticsVideoInfo | null;
	bySource?: SourceBreakdownItem[];
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
	revenueUsdExact?: string;
}

/** Một điểm trên line-chart revenue theo tháng */
export interface TerritoryBarChartItem {
	territory: string;
	isoCode?: string;
	totalViews?: number;
	revenueUsd?: number;
	revenueUsdExact?: string;
}

export interface EntityTopDspItem {
	rank: number;
	pgDspId: string | null;
	dspReportId: string;
	dspName: string;
	totalViews: number;
	totalRevenueUsd: string;
}

export interface EntityTopTerItem {
	rank: number;
	isoCode: string;
	territory: string;
	totalViews: number;
	totalRevenueUsd: string;
}

export interface RevenueLineChartItem {
	period: string; // 'YYYY-MM'
	revenueUsd: number;
	revenueUsdExact?: string;
	quantity: number;
}

/** Metadata của DSP entity (lookup từ Postgres nếu có pgDspId) */
export interface DspMeta {
	pgDspId: string | null;
	dspReportId: string | null;
	name: string;
	code: string | null;
	picture: string | null;
	isActive: boolean | null;
	type: string | null;
}

/** Response cho POST /analytics/dsp/overview */
export interface DspOverviewResponse {
	totalTrendViews: number;
	totalSalesViews: number;
	totalRevenueUsd: number;
	totalRevenueUsdExact?: string;
	dsp: DspMeta | null;
}

/** Item trong top-tracks của DSP */
export interface DspTopTrackItem {
	rank: number;
	isrc: string;
	title: string;
	version: string | null;
	artistName: string;
	releaseId: string;
	releaseTitle: string;
	totalViews: number;
	totalRevenueUsd: string;
	release: { coverArtThumbnails: ICoverArtThumbnails } | null;
}

/** Item trong top-releases của DSP hoặc channel */
export interface DspTopReleaseItem {
	rank: number;
	releaseId: string;
	title: string;
	upc: string | null;
	labelId: string | null;
	labelName: string | null;
	trackCount: number;
	totalViews: number;
	totalRevenueUsd: string;
	release: { coverArtThumbnails: ICoverArtThumbnails } | null;
}
