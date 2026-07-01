/**
 * Trang thai cua YouTube API key trong pool.
 */
export enum YoutubeApiKeyStatus {
	ACTIVE = 'active',
	DISABLED = 'disabled',
	QUOTA_EXCEEDED = 'quota_exceeded',
	INVALID = 'invalid',
}

/**
 * Trang thai enrichment YouTube cho tung video.
 * NULL o video = chua duoc scan lan nao.
 */
export enum YoutubeMatchStatus {
	MATCHED = 'matched',
	NO_MATCH = 'no_match',
	NO_DATA = 'no_data',
}

/**
 * Loai lookup goi YouTube API.
 */
export enum YoutubeLookupKind {
	BY_ID = 'by_id',
	SEARCH = 'search',
}
