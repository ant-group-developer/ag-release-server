import { YoutubeMatchStatus } from '../enum/youtube.enum';

/**
 * 1 video can enrich YouTube.
 */
export interface YoutubeEnrichmentInput {
	/** Video id trong Postgres */
	videoId: string;
	/** ISRC (dung lam key ket qua) */
	isrc: string;
	/** externalId trong bang videos (co the la YouTube video ID 11 ky tu, hoac null, hoac chuoi bat ky) */
	externalId: string | null;
	/** Title release/video de build search query */
	videoTitle: string;
	/** Ten artists (join lai lam query) */
	artistNames: string[];
}

/**
 * Ket qua enrich cho 1 video.
 */
export interface YoutubeEnrichmentResult {
	isrc: string;
	videoId: string;
	matchStatus: YoutubeMatchStatus;
	youtubeVideoId: string | null;
	youtubeChannelId: string | null;
	youtubeChannelTitle: string | null;
	/** UUID cua bang channels Postgres neu match, NULL neu khong */
	matchedChannelPgId: string | null;
	source: 'youtube_id_lookup' | 'youtube_search' | 'cache';
}
