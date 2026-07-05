import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Channel } from 'src/modules/channel/entities/channel.entity';
import { Repository } from 'typeorm';
import { YOUTUBE_VIDEO_ID_REGEX } from '../constants/youtube.constants';
import {
	YoutubeEnrichmentInput,
	YoutubeEnrichmentResult,
} from '../dto/youtube-enrichment-result.dto';
import { YoutubeLookupKind, YoutubeMatchStatus } from '../enum/youtube.enum';
import {
	YoutubeApiClientService,
	YoutubeVideoSnippet,
} from './youtube-api-client.service';
import { NoAvailableYoutubeKeyError } from './youtube-api-key-pool.service';
import { YoutubeSearchCacheService } from './youtube-search-cache.service';

/**
 * 3-tier enrichment cho video releases:
 *   Tier 1 - Batch by externalId (11-char YouTube ID) -> 1 unit / 50 IDs
 *   Tier 2 - Cache search result -> 0 unit
 *   Tier 3 - Search fallback -> 100 units, top 3, match channel Postgres
 */
@Injectable()
export class YoutubeEnrichmentService {
	private readonly logger = new Logger(YoutubeEnrichmentService.name);

	constructor(
		private readonly apiClient: YoutubeApiClientService,
		private readonly cache: YoutubeSearchCacheService,
		@InjectRepository(Channel)
		private readonly channelRepo: Repository<Channel>,
	) {}

	/**
	 * Enrich 1 batch video. Return Map<isrc, YoutubeEnrichmentResult>.
	 */
	async enrichBatch(
		inputs: YoutubeEnrichmentInput[],
	): Promise<Map<string, YoutubeEnrichmentResult>> {
		const results = new Map<string, YoutubeEnrichmentResult>();
		if (inputs.length === 0) return results;

		// Chia 2 nhom: co externalId hop le vs khong
		const withValidId: YoutubeEnrichmentInput[] = [];
		const withoutId: YoutubeEnrichmentInput[] = [];
		for (const input of inputs) {
			if (
				input.externalId &&
				YOUTUBE_VIDEO_ID_REGEX.test(input.externalId.trim())
			) {
				withValidId.push(input);
			} else {
				withoutId.push(input);
			}
		}

		// --- Tier 1: Batch by videoId ---
		if (withValidId.length > 0) {
			await this.enrichByVideoId(withValidId, results);
		}

		// --- Tier 2+3: Cache search + fallback ---
		for (const input of withoutId) {
			try {
				const res = await this.enrichBySearch(input);
				results.set(input.isrc, res);
			} catch (err: any) {
				if (err instanceof NoAvailableYoutubeKeyError) {
					// Ngat toan bo batch — het quota
					this.logger.error(
						`No YouTube key available. Aborting remaining enrichments in batch.`,
					);
					break;
				}
				this.logger.warn(
					`Enrich search failed isrc=${input.isrc}: ${err.message}`,
				);
				results.set(
					input.isrc,
					this.buildNoDataResult(input, 'youtube_search'),
				);
			}
		}

		return results;
	}

	// ─────────────────────────────────────────────────────────────
	// Tier 1: batch videos.list by externalId
	// ─────────────────────────────────────────────────────────────
	private async enrichByVideoId(
		inputs: YoutubeEnrichmentInput[],
		results: Map<string, YoutubeEnrichmentResult>,
	): Promise<void> {
		// Check cache truoc
		const uncachedIds: string[] = [];
		const idToInputs = new Map<string, YoutubeEnrichmentInput[]>();

		for (const input of inputs) {
			const vid = input.externalId!.trim();
			// group ISRCs share cung 1 videoId (hiem nhung co the)
			const arr = idToInputs.get(vid) ?? [];
			arr.push(input);
			idToInputs.set(vid, arr);
		}

		for (const [vid, groupInputs] of idToInputs) {
			const cacheKey = this.cache.buildIdKey(vid);
			const cached = await this.cache.get(cacheKey);
			if (cached) {
				for (const input of groupInputs) {
					results.set(input.isrc, {
						isrc: input.isrc,
						videoId: input.videoId,
						matchStatus: cached.matchStatus,
						youtubeVideoId: cached.youtubeVideoId,
						youtubeChannelId: cached.youtubeChannelId,
						youtubeChannelTitle: cached.youtubeChannelTitle,
						matchedChannelPgId: cached.matchedChannelId,
						source: 'cache',
					});
				}
			} else {
				uncachedIds.push(vid);
			}
		}

		if (uncachedIds.length === 0) return;

		let snippets: Map<string, YoutubeVideoSnippet>;
		try {
			snippets = await this.apiClient.getVideosById(uncachedIds);
		} catch (err: any) {
			if (err instanceof NoAvailableYoutubeKeyError) {
				this.logger.error(
					`No YouTube key. Aborting batch videos.list for ${uncachedIds.length} ids`,
				);
				for (const vid of uncachedIds) {
					const groupInputs = idToInputs.get(vid) ?? [];
					for (const input of groupInputs) {
						results.set(
							input.isrc,
							this.buildNoDataResult(input, 'youtube_id_lookup'),
						);
					}
				}
				return;
			}
			throw err;
		}

		for (const vid of uncachedIds) {
			const snippet = snippets.get(vid);
			const groupInputs = idToInputs.get(vid) ?? [];
			const cacheKey = this.cache.buildIdKey(vid);

			if (!snippet) {
				// Video khong ton tai tren YouTube -> cache no_data
				for (const input of groupInputs) {
					results.set(
						input.isrc,
						this.buildNoDataResult(input, 'youtube_id_lookup'),
					);
				}
				await this.cache.put(cacheKey, `by_id:${vid}`, {
					lookupKind: YoutubeLookupKind.BY_ID,
					youtubeVideoId: vid,
					youtubeChannelId: null,
					youtubeChannelTitle: null,
					matchedChannelId: null,
					matchStatus: YoutubeMatchStatus.NO_DATA,
					rawResponse: null,
				});
				continue;
			}

			const matched = await this.tryMatchChannel(
				snippet.channelId,
				snippet.channelTitle,
			);

			const matchStatus = matched
				? YoutubeMatchStatus.MATCHED
				: YoutubeMatchStatus.NO_MATCH;

			for (const input of groupInputs) {
				results.set(input.isrc, {
					isrc: input.isrc,
					videoId: input.videoId,
					matchStatus,
					youtubeVideoId: vid,
					youtubeChannelId: snippet.channelId,
					youtubeChannelTitle: this.decodeHtmlEntities(
						snippet.channelTitle,
					),
					matchedChannelPgId: matched?.pgChannelId ?? null,
					source: 'youtube_id_lookup',
				});
			}

			await this.cache.put(cacheKey, `by_id:${vid}`, {
				lookupKind: YoutubeLookupKind.BY_ID,
				youtubeVideoId: vid,
				youtubeChannelId: snippet.channelId,
				youtubeChannelTitle: this.decodeHtmlEntities(
					snippet.channelTitle,
				),
				matchedChannelId: matched?.pgChannelId ?? null,
				matchStatus,
				rawResponse: snippet,
			});
		}
	}

	// ─────────────────────────────────────────────────────────────
	// Tier 2+3: cache search or call search API
	// ─────────────────────────────────────────────────────────────
	private async enrichBySearch(
		input: YoutubeEnrichmentInput,
	): Promise<YoutubeEnrichmentResult> {
		const rawQuery = this.buildSearchQuery(input);
		const { hash, normalized } = this.cache.buildSearchKey(rawQuery);

		const cached = await this.cache.get(hash);
		if (cached) {
			return {
				isrc: input.isrc,
				videoId: input.videoId,
				matchStatus: cached.matchStatus,
				youtubeVideoId: cached.youtubeVideoId,
				youtubeChannelId: cached.youtubeChannelId,
				youtubeChannelTitle: cached.youtubeChannelTitle,
				matchedChannelPgId: cached.matchedChannelId,
				source: 'cache',
			};
		}

		// Truong hop query rong ~ khong the search
		if (!normalized || normalized.length < 3) {
			await this.cache.put(hash, rawQuery, {
				lookupKind: YoutubeLookupKind.SEARCH,
				youtubeVideoId: null,
				youtubeChannelId: null,
				youtubeChannelTitle: null,
				matchedChannelId: null,
				matchStatus: YoutubeMatchStatus.NO_DATA,
				rawResponse: null,
			});
			return this.buildNoDataResult(input, 'youtube_search');
		}

		const search = await this.apiClient.searchVideo(normalized);
		const items = search.items;

		if (items.length === 0) {
			await this.cache.put(hash, rawQuery, {
				lookupKind: YoutubeLookupKind.SEARCH,
				youtubeVideoId: null,
				youtubeChannelId: null,
				youtubeChannelTitle: null,
				matchedChannelId: null,
				matchStatus: YoutubeMatchStatus.NO_DATA,
				rawResponse: search.raw,
			});
			return this.buildNoDataResult(input, 'youtube_search');
		}

		// Lay top 3, thu match tung item
		for (const item of items) {
			const matched = await this.tryMatchChannel(
				item.channelId,
				item.channelTitle,
			);
			if (matched) {
				const decodedTitle = this.decodeHtmlEntities(item.channelTitle);
				await this.cache.put(hash, rawQuery, {
					lookupKind: YoutubeLookupKind.SEARCH,
					youtubeVideoId: item.videoId,
					youtubeChannelId: item.channelId,
					youtubeChannelTitle: decodedTitle,
					matchedChannelId: matched.pgChannelId,
					matchStatus: YoutubeMatchStatus.MATCHED,
					rawResponse: search.raw,
				});
				return {
					isrc: input.isrc,
					videoId: input.videoId,
					matchStatus: YoutubeMatchStatus.MATCHED,
					youtubeVideoId: item.videoId,
					youtubeChannelId: item.channelId,
					youtubeChannelTitle: decodedTitle,
					matchedChannelPgId: matched.pgChannelId,
					source: 'youtube_search',
				};
			}
		}

		// Khong match no channel Postgres nao trong top 3
		const first = items[0];
		const decodedFirstTitle = this.decodeHtmlEntities(first.channelTitle);
		await this.cache.put(hash, rawQuery, {
			lookupKind: YoutubeLookupKind.SEARCH,
			youtubeVideoId: first.videoId,
			youtubeChannelId: first.channelId,
			youtubeChannelTitle: decodedFirstTitle,
			matchedChannelId: null,
			matchStatus: YoutubeMatchStatus.NO_MATCH,
			rawResponse: search.raw,
		});
		return {
			isrc: input.isrc,
			videoId: input.videoId,
			matchStatus: YoutubeMatchStatus.NO_MATCH,
			youtubeVideoId: first.videoId,
			youtubeChannelId: first.channelId,
			youtubeChannelTitle: decodedFirstTitle,
			matchedChannelPgId: null,
			source: 'youtube_search',
		};
	}

	// ─────────────────────────────────────────────────────────────
	// Channel matching Postgres
	// ─────────────────────────────────────────────────────────────
	async tryMatchChannel(
		youtubeChannelId: string,
		youtubeChannelTitle: string,
	): Promise<{ pgChannelId: string } | null> {
		if (!youtubeChannelId && !youtubeChannelTitle) return null;

		// Priority 1: youtube_channel_id
		if (youtubeChannelId) {
			const byYtId = await this.channelRepo.findOne({
				where: { youtubeChannelId },
			});
			if (byYtId) return { pgChannelId: byYtId.id };
		}

		// Priority 2: name (case insensitive exact match)
		const decodedTitle = this.decodeHtmlEntities(youtubeChannelTitle);
		if (decodedTitle) {
			const byName = await this.channelRepo
				.createQueryBuilder('c')
				.where('LOWER(c.name) = LOWER(:name)', { name: decodedTitle })
				.getOne();
			if (byName) {
				// Backfill youtubeChannelId neu chua co, giup lan sau nhanh hon
				if (!byName.youtubeChannelId && youtubeChannelId) {
					try {
						await this.channelRepo.update(byName.id, {
							youtubeChannelId,
						});
					} catch (err: any) {
						this.logger.warn(
							`Backfill youtubeChannelId cho channel ${byName.id} that bai: ${err.message}`,
						);
					}
				}
				return { pgChannelId: byName.id };
			}
		}

		return null;
	}

	// ─────────────────────────────────────────────────────────────
	// Helpers
	// ─────────────────────────────────────────────────────────────
	private buildSearchQuery(input: YoutubeEnrichmentInput): string {
		const artist = (input.artistNames || []).filter(Boolean).join(' ');
		const title = input.videoTitle || '';
		return `${artist} ${title}`.trim();
	}

	private buildNoDataResult(
		input: YoutubeEnrichmentInput,
		source: 'youtube_id_lookup' | 'youtube_search',
	): YoutubeEnrichmentResult {
		return {
			isrc: input.isrc,
			videoId: input.videoId,
			matchStatus: YoutubeMatchStatus.NO_DATA,
			youtubeVideoId: null,
			youtubeChannelId: null,
			youtubeChannelTitle: null,
			matchedChannelPgId: null,
			source,
		};
	}

	/**
	 * Decode HTML entities co the xuat hien trong channelTitle YouTube tra ve
	 * (&#39; -> ', &amp; -> &, &quot; -> ", ...).
	 */
	private decodeHtmlEntities(s: string | null | undefined): string {
		if (!s) return '';
		return s
			.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
			.replace(/&#x([0-9a-fA-F]+);/g, (_, n) =>
				String.fromCharCode(parseInt(n, 16)),
			)
			.replace(/&amp;/g, '&')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&quot;/g, '"')
			.replace(/&apos;/g, "'");
	}
}
