import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError } from 'axios';
import {
	YOUTUBE_CHANNELS_BATCH_SIZE,
	YOUTUBE_CHANNELS_LIST_ENDPOINT,
	YOUTUBE_INITIAL_BACKOFF_MS,
	YOUTUBE_MAX_KEY_ROTATIONS_PER_CALL,
	YOUTUBE_MAX_RETRIES_TRANSIENT,
	YOUTUBE_QUOTA_COST_CHANNELS_LIST,
	YOUTUBE_QUOTA_COST_SEARCH,
	YOUTUBE_QUOTA_COST_VIDEOS_LIST,
	YOUTUBE_SEARCH_ENDPOINT,
	YOUTUBE_SEARCH_MAX_RESULTS,
	YOUTUBE_VIDEOS_BATCH_SIZE,
	YOUTUBE_VIDEOS_LIST_ENDPOINT,
} from '../constants/youtube.constants';
import {
	NoAvailableYoutubeKeyError,
	YoutubeApiKeyPoolService,
} from './youtube-api-key-pool.service';

export interface YoutubeVideoSnippet {
	videoId: string;
	channelId: string;
	channelTitle: string;
	title: string;
	description: string;
}

export interface YoutubeSearchResultItem {
	videoId: string;
	channelId: string;
	channelTitle: string;
	title: string;
}

export interface YoutubeSearchResult {
	items: YoutubeSearchResultItem[];
	raw: unknown;
}

export interface YoutubeChannelSnippet {
	channelId: string;
	title: string;
	thumbnailUrl: string | null;
}

/**
 * Low-level HTTP client tuong tac voi YouTube Data API v3.
 *
 * - Tu dong xoay key qua YoutubeApiKeyPoolService khi gap 403 quotaExceeded / keyInvalid.
 * - Retry 429/5xx voi exponential backoff.
 * - Batch getVideosById toi da 50 id/call.
 */
@Injectable()
export class YoutubeApiClientService {
	private readonly logger = new Logger(YoutubeApiClientService.name);

	constructor(private readonly pool: YoutubeApiKeyPoolService) {}

	/**
	 * Batch fetch metadata cho nhieu videoId trong 1 call videos.list.
	 * Return map<videoId, snippet>. VideoId khong ton tai YouTube -> khong co trong map.
	 * Cost: ceil(videoIds/50) * 1 unit.
	 */
	async getVideosById(
		videoIds: string[],
	): Promise<Map<string, YoutubeVideoSnippet>> {
		const result = new Map<string, YoutubeVideoSnippet>();
		if (videoIds.length === 0) return result;

		// Dedupe & chunk
		const unique = Array.from(new Set(videoIds));
		for (let i = 0; i < unique.length; i += YOUTUBE_VIDEOS_BATCH_SIZE) {
			const chunk = unique.slice(i, i + YOUTUBE_VIDEOS_BATCH_SIZE);
			const items = await this.executeWithKeyRotation(
				YOUTUBE_QUOTA_COST_VIDEOS_LIST,
				(apiKey) =>
					axios.get(YOUTUBE_VIDEOS_LIST_ENDPOINT, {
						params: {
							part: 'snippet',
							id: chunk.join(','),
							key: apiKey,
						},
						timeout: 15000,
					}),
			);
			for (const it of items?.data?.items ?? []) {
				const sn = it.snippet ?? {};
				result.set(it.id, {
					videoId: it.id,
					channelId: sn.channelId ?? '',
					channelTitle: sn.channelTitle ?? '',
					title: sn.title ?? '',
					description: sn.description ?? '',
				});
			}
		}
		return result;
	}

	/**
	 * Batch fetch public metadata for channels. Returns only fields that the
	 * channel-sync workflow is allowed to propose for update.
	 * Cost: ceil(channelIds/50) * 1 unit.
	 */
	async getChannelsById(
		channelIds: string[],
	): Promise<Map<string, YoutubeChannelSnippet>> {
		const result = new Map<string, YoutubeChannelSnippet>();
		if (channelIds.length === 0) return result;

		const unique = Array.from(
			new Set(channelIds.map((id) => id.trim()).filter(Boolean)),
		);
		for (let i = 0; i < unique.length; i += YOUTUBE_CHANNELS_BATCH_SIZE) {
			const chunk = unique.slice(i, i + YOUTUBE_CHANNELS_BATCH_SIZE);
			const response = await this.executeWithKeyRotation(
				YOUTUBE_QUOTA_COST_CHANNELS_LIST,
				(apiKey) =>
					axios.get(YOUTUBE_CHANNELS_LIST_ENDPOINT, {
						params: {
							part: 'snippet',
							id: chunk.join(','),
							key: apiKey,
						},
						timeout: 15000,
					}),
			);

			for (const item of response?.data?.items ?? []) {
				const snippet = item?.snippet ?? {};
				const thumbnails = snippet.thumbnails ?? {};
				const thumbnailUrl =
					thumbnails.high?.url ??
					thumbnails.medium?.url ??
					thumbnails.default?.url ??
					null;
				if (!item?.id) continue;
				result.set(item.id, {
					channelId: item.id,
					title: snippet.title ?? '',
					thumbnailUrl,
				});
			}
		}

		return result;
	}

	/**
	 * Search video theo query text. Return top N ket qua (default 3).
	 * Cost: 100 units / call.
	 */
	async searchVideo(
		query: string,
		maxResults: number = YOUTUBE_SEARCH_MAX_RESULTS,
	): Promise<YoutubeSearchResult> {
		const response = await this.executeWithKeyRotation(
			YOUTUBE_QUOTA_COST_SEARCH,
			(apiKey) =>
				axios.get(YOUTUBE_SEARCH_ENDPOINT, {
					params: {
						part: 'snippet',
						q: query,
						type: 'video',
						maxResults,
						key: apiKey,
					},
					timeout: 15000,
				}),
		);
		const items: YoutubeSearchResultItem[] = (response?.data?.items ?? [])
			.filter((it: any) => it?.id?.videoId)
			.map((it: any) => ({
				videoId: it.id.videoId,
				channelId: it.snippet?.channelId ?? '',
				channelTitle: it.snippet?.channelTitle ?? '',
				title: it.snippet?.title ?? '',
			}));
		return { items, raw: response?.data ?? null };
	}

	/**
	 * Execute 1 API call. Neu key exhausted/invalid -> tu dong rotate sang key khac.
	 * Neu 429/5xx -> exponential backoff retry.
	 */
	private async executeWithKeyRotation<T>(
		estimatedCost: number,
		fn: (apiKey: string) => Promise<T>,
	): Promise<T> {
		let rotations = 0;
		let lastErr: unknown;

		while (rotations < YOUTUBE_MAX_KEY_ROTATIONS_PER_CALL) {
			let acquired: { id: string; plaintextKey: string; alias: string };
			try {
				acquired = this.pool.acquire(estimatedCost);
			} catch (err) {
				if (err instanceof NoAvailableYoutubeKeyError) throw err;
				throw err;
			}

			try {
				const res = await this.requestWithRetry(() =>
					fn(acquired.plaintextKey),
				);
				// Success -> ghi nhan consume
				this.pool.recordUsage(acquired.id, estimatedCost);
				return res;
			} catch (err) {
				const axiosErr = err as AxiosError;
				const status = axiosErr.response?.status;
				const errData = axiosErr.response?.data as any;
				const reason: string | undefined =
					errData?.error?.errors?.[0]?.reason ??
					errData?.error?.status;

				if (status === 403) {
					if (
						reason === 'quotaExceeded' ||
						reason === 'dailyLimitExceeded' ||
						reason === 'rateLimitExceeded'
					) {
						this.pool.markKeyExhausted(acquired.id, reason);
						rotations++;
						lastErr = err;
						this.logger.warn(
							`Key alias=${acquired.alias} exhausted (${reason}). Rotating (${rotations}/${YOUTUBE_MAX_KEY_ROTATIONS_PER_CALL})...`,
						);
						continue;
					}
					if (
						reason === 'keyInvalid' ||
						reason === 'accessNotConfigured' ||
						reason === 'forbidden'
					) {
						this.pool.markKeyInvalid(
							acquired.id,
							reason ?? errData?.error?.message ?? 'forbidden',
						);
						rotations++;
						lastErr = err;
						this.logger.error(
							`Key alias=${acquired.alias} invalid (${reason}). Rotating...`,
						);
						continue;
					}
				}
				throw err;
			}
		}

		if (lastErr instanceof Error) throw lastErr;
		throw new Error(
			`YouTube API call failed after ${YOUTUBE_MAX_KEY_ROTATIONS_PER_CALL} key rotations`,
		);
	}

	/**
	 * Retry transient errors (429, 5xx). Not touching 4xx business errors.
	 */
	private async requestWithRetry<T>(
		fn: () => Promise<T>,
		retries = YOUTUBE_MAX_RETRIES_TRANSIENT,
		delayMs = YOUTUBE_INITIAL_BACKOFF_MS,
	): Promise<T> {
		try {
			return await fn();
		} catch (err) {
			const axiosErr = err as AxiosError;
			const status = axiosErr.response?.status;

			if (status === 429 && retries > 0) {
				const retryAfterHeader =
					axiosErr.response?.headers?.['retry-after'];
				const retryAfterMs = this.parseRetryAfterMs(retryAfterHeader);
				const waitTime = Math.min(retryAfterMs ?? delayMs, 30_000);
				this.logger.warn(
					`[YouTube API] 429 Too Many Requests. Retrying after ${waitTime}ms (retries=${retries})`,
				);
				await new Promise((r) => setTimeout(r, waitTime));
				return this.requestWithRetry(
					fn,
					retries - 1,
					Math.min(delayMs * 2, 30_000),
				);
			}

			if (retries > 0 && (!status || status >= 500)) {
				this.logger.warn(
					`[YouTube API] Transient error (${status ?? 'network'}). Retrying in ${delayMs}ms...`,
				);
				await new Promise((r) => setTimeout(r, delayMs));
				return this.requestWithRetry(
					fn,
					retries - 1,
					Math.min(delayMs * 2, 30_000),
				);
			}

			throw err;
		}
	}

	private parseRetryAfterMs(value: unknown): number | null {
		if (value == null) return null;
		const num = Number(Array.isArray(value) ? value[0] : value);
		if (Number.isFinite(num) && num > 0) return num * 1000;
		return null;
	}
}
