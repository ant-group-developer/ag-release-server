import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'crypto';
import { LessThan, Repository } from 'typeorm';
import { YOUTUBE_CACHE_TTL_DAYS } from '../constants/youtube.constants';
import { YoutubeSearchCache } from '../entities/youtube-search-cache.entity';
import { YoutubeLookupKind, YoutubeMatchStatus } from '../enum/youtube.enum';

export interface YoutubeCacheEntry {
	lookupKind: YoutubeLookupKind;
	youtubeVideoId: string | null;
	youtubeChannelId: string | null;
	youtubeChannelTitle: string | null;
	matchedChannelId: string | null;
	matchStatus: YoutubeMatchStatus;
	rawResponse: unknown | null;
}

@Injectable()
export class YoutubeSearchCacheService {
	private readonly logger = new Logger(YoutubeSearchCacheService.name);

	constructor(
		@InjectRepository(YoutubeSearchCache)
		private readonly repo: Repository<YoutubeSearchCache>,
	) {}

	/**
	 * Build key hash cho lookup by videoId.
	 */
	buildIdKey(videoId: string): string {
		return this.hash(`by_id:${videoId}`);
	}

	/**
	 * Build key hash cho search query.
	 * Query se duoc normalize (lowercase, collapse whitespace) truoc khi hash.
	 */
	buildSearchKey(rawQuery: string): { hash: string; normalized: string } {
		const normalized = this.normalizeSearchQuery(rawQuery);
		return { hash: this.hash(`search:${normalized}`), normalized };
	}

	async get(queryHash: string): Promise<YoutubeCacheEntry | null> {
		const row = await this.repo.findOne({ where: { queryHash } });
		if (!row) return null;
		if (row.expiresAt.getTime() < Date.now()) return null;
		return {
			lookupKind: row.lookupKind,
			youtubeVideoId: row.youtubeVideoId,
			youtubeChannelId: row.youtubeChannelId,
			youtubeChannelTitle: row.youtubeChannelTitle,
			matchedChannelId: row.matchedChannelId,
			matchStatus: row.matchStatus,
			rawResponse: row.rawResponse,
		};
	}

	async put(
		queryHash: string,
		queryText: string,
		entry: YoutubeCacheEntry,
	): Promise<void> {
		const expiresAt = new Date(
			Date.now() + YOUTUBE_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000,
		);
		// Upsert theo query_hash unique. TypeORM khong co simple upsert cross-DB tot,
		// dung raw approach: try insert, neu conflict -> update.
		try {
			await this.repo
				.createQueryBuilder()
				.insert()
				.into(YoutubeSearchCache)
				.values({
					queryHash,
					queryText,
					lookupKind: entry.lookupKind,
					youtubeVideoId: entry.youtubeVideoId,
					youtubeChannelId: entry.youtubeChannelId,
					youtubeChannelTitle: entry.youtubeChannelTitle,
					matchedChannelId: entry.matchedChannelId,
					matchStatus: entry.matchStatus,
					rawResponse: (entry.rawResponse ?? null) as any,
					cachedAt: new Date(),
					expiresAt,
				} as any)
				.orUpdate(
					[
						'query_text',
						'lookup_kind',
						'youtube_video_id',
						'youtube_channel_id',
						'youtube_channel_title',
						'matched_channel_id',
						'match_status',
						'raw_response',
						'cached_at',
						'expires_at',
					],
					['query_hash'],
				)
				.execute();
		} catch (err: any) {
			this.logger.warn(`YouTube search cache put failed: ${err.message}`);
		}
	}

	/**
	 * Xoa 1 cache entry theo hash.
	 */
	async invalidate(queryHash: string): Promise<void> {
		await this.repo.delete({ queryHash });
	}

	/**
	 * Xoa entries het han. Chay cron trong pool service hoac schedule khac.
	 */
	async pruneExpired(): Promise<number> {
		const now = new Date();
		const result = await this.repo.delete({
			expiresAt: LessThan(now),
		});
		return result.affected ?? 0;
	}

	private hash(input: string): string {
		return crypto.createHash('sha256').update(input).digest('hex');
	}

	/**
	 * Normalize search query truoc khi hash de tang cache hit rate.
	 * - lowercase
	 * - strip common markers [Official Video], (Official Audio), etc.
	 * - collapse whitespace
	 * - truncate 200 chars
	 */
	private normalizeSearchQuery(input: string): string {
		let s = (input ?? '').toString();
		s = s.toLowerCase();
		s = s.replace(
			/\[(?:official|hd|hq|4k)[^\]]*\]|\((?:official|hd|hq|4k)[^\)]*\)/gi,
			' ',
		);
		s = s.replace(/[\r\n\t]+/g, ' ');
		s = s.replace(/\s+/g, ' ').trim();
		if (s.length > 200) s = s.slice(0, 200);
		return s;
	}
}
