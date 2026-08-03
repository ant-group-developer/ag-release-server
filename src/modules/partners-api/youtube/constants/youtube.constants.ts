/**
 * Endpoints
 */
export const YOUTUBE_API_BASE_URL = 'https://www.googleapis.com/youtube/v3';
export const YOUTUBE_VIDEOS_LIST_ENDPOINT = `${YOUTUBE_API_BASE_URL}/videos`;
export const YOUTUBE_SEARCH_ENDPOINT = `${YOUTUBE_API_BASE_URL}/search`;
export const YOUTUBE_CHANNELS_LIST_ENDPOINT = `${YOUTUBE_API_BASE_URL}/channels`;

/**
 * Quota cost per call theo YouTube Data API v3.
 * @see https://developers.google.com/youtube/v3/determine_quota_cost
 */
export const YOUTUBE_QUOTA_COST_VIDEOS_LIST = 1; // videos.list: 1 unit / call (max 50 ids)
export const YOUTUBE_QUOTA_COST_SEARCH = 100; // search.list: 100 units / call
export const YOUTUBE_QUOTA_COST_CHANNELS_LIST = 1; // channels.list: 1 unit / call (max 50 ids)

/**
 * YouTube videos.list ho tro batch tao 50 id trong 1 request.
 */
export const YOUTUBE_VIDEOS_BATCH_SIZE = 50;
export const YOUTUBE_CHANNELS_BATCH_SIZE = 50;

/**
 * Max results tra ve tu search.list.
 * Da chot: lay top 3 de tang xac suat match channel Postgres.
 */
export const YOUTUBE_SEARCH_MAX_RESULTS = 3;

/**
 * Regex xac dinh 1 chuoi la video ID YouTube hop le (11 ky tu).
 */
export const YOUTUBE_VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

/**
 * Regex validate Google API key format.
 * Google API keys thuong bat dau bang AIza va co 39 ky tu.
 */
export const GOOGLE_API_KEY_REGEX = /^AIza[A-Za-z0-9_-]{35}$/;

/**
 * Cache TTL cho ket qua goi YouTube (search hoac by-id).
 * 60 ngay: channel rename hiem, video ID gan nhu khong doi.
 */
export const YOUTUBE_CACHE_TTL_DAYS = 60;

/**
 * Safety margin de tranh consume vuot quota cua 1 key.
 * Khi remaining <= margin -> chuyen sang key khac.
 */
export const YOUTUBE_KEY_SAFETY_MARGIN_UNITS = 100;

/**
 * Env var chua master key encrypt AES-256-GCM cho youtube_api_keys.
 * Format: base64 32 bytes (openssl rand -base64 32).
 */
export const YOUTUBE_KEY_ENCRYPTION_SECRET_ENV =
	'YOUTUBE_KEY_ENCRYPTION_SECRET';

/**
 * Retry limits copy pattern Spotify.
 */
export const YOUTUBE_MAX_RETRIES_TRANSIENT = 5;
export const YOUTUBE_INITIAL_BACKOFF_MS = 1000;
export const YOUTUBE_MAX_KEY_ROTATIONS_PER_CALL = 5;

/**
 * Concurrency defaults khi enrich video batch.
 */
export const YOUTUBE_ENRICH_DEFAULT_CONCURRENCY = 5;
