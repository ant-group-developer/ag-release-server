import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { YOUTUBE_KEY_SAFETY_MARGIN_UNITS } from '../constants/youtube.constants';
import { YoutubeApiKeyStatus } from '../enum/youtube.enum';
import { YoutubeApiKeyService } from './youtube-api-key.service';

interface PooledKey {
	id: string;
	alias: string;
	plaintextKey: string;
	status: YoutubeApiKeyStatus;
	dailyQuotaLimit: number;
	unitsConsumedToday: number;
	consecutiveErrorCount: number;
	lastError: string | null;
}

export class NoAvailableYoutubeKeyError extends Error {
	constructor(
		message = 'No YouTube API key available (all disabled/exhausted)',
	) {
		super(message);
		this.name = NoAvailableYoutubeKeyError.name;
	}
}

/**
 * In-memory pool cua YouTube API keys.
 *
 * - Load tu DB luc onModuleInit va poll refresh moi 60s (theo doi thay doi admin).
 * - `acquire(estimatedCost)` chon key least-used-first co du quota.
 * - `recordUsage(id, actual)` update counter + persist bat dong bo.
 * - `markKeyExhausted` / `markKeyInvalid` khi API tra loi.
 * - Cron reset counter hang ngay luc 00:00 Pacific Time (~ 08:00 UTC).
 */
@Injectable()
export class YoutubeApiKeyPoolService implements OnModuleInit {
	private readonly logger = new Logger(YoutubeApiKeyPoolService.name);
	private keys: Map<string, PooledKey> = new Map();
	private refreshTimer: NodeJS.Timeout | null = null;

	private static readonly REFRESH_INTERVAL_MS = 60_000;

	constructor(private readonly keyService: YoutubeApiKeyService) {}

	onModuleInit(): void {
		const scheduleRefresh = () => {
			this.refreshTimer = setInterval(() => {
				this.reload().catch((err) => {
					this.logger.error(`Pool refresh failed: ${err.message}`);
				});
			}, YoutubeApiKeyPoolService.REFRESH_INTERVAL_MS);
		};

		this.reload()
			.then(() => scheduleRefresh())
			.catch((err) => {
				this.logger.error(
					`YouTube key pool init failed: ${err.message}`,
				);
				scheduleRefresh();
			});
	}

	onModuleDestroy(): void {
		if (this.refreshTimer) clearInterval(this.refreshTimer);
	}

	/**
	 * Load lai keys tu DB. Merge counter in-memory de tranh mat progress consume.
	 */
	private async reload(): Promise<void> {
		try {
			const rows = await this.keyService.findUsableKeysRaw();
			const newMap = new Map<string, PooledKey>();
			for (const row of rows) {
				const existing = this.keys.get(row.id);
				const plaintext =
					existing?.plaintextKey ?? this.keyService.decryptKey(row);
				// Uu tien counter DB neu > in-memory (co the co instance khac update)
				const unitsFromDb = row.unitsConsumedToday;
				const unitsInMem = existing?.unitsConsumedToday ?? 0;
				const units = Math.max(unitsFromDb, unitsInMem);
				newMap.set(row.id, {
					id: row.id,
					alias: row.alias,
					plaintextKey: plaintext,
					status: row.status,
					dailyQuotaLimit: row.dailyQuotaLimit,
					unitsConsumedToday: units,
					consecutiveErrorCount: row.consecutiveErrorCount,
					lastError: row.lastError,
				});
			}
			this.keys = newMap;
		} catch (err: any) {
			this.logger.error(`Reload YouTube key pool failed: ${err.message}`);
		}
	}

	/**
	 * Pick 1 key co du quota (>= estimatedCost + safety margin), least-used first.
	 * Throw NoAvailableYoutubeKeyError neu khong con key nao.
	 */
	acquire(estimatedCost: number): {
		id: string;
		plaintextKey: string;
		alias: string;
	} {
		const candidates: PooledKey[] = [];
		for (const key of this.keys.values()) {
			if (key.status !== YoutubeApiKeyStatus.ACTIVE) continue;
			const remaining = key.dailyQuotaLimit - key.unitsConsumedToday;
			if (remaining < estimatedCost + YOUTUBE_KEY_SAFETY_MARGIN_UNITS)
				continue;
			candidates.push(key);
		}
		if (candidates.length === 0) {
			throw new NoAvailableYoutubeKeyError();
		}
		candidates.sort((a, b) => a.unitsConsumedToday - b.unitsConsumedToday);
		const chosen = candidates[0];
		return {
			id: chosen.id,
			plaintextKey: chosen.plaintextKey,
			alias: chosen.alias,
		};
	}

	/**
	 * Ghi nhan cost consumed cho 1 key. Update in-memory + persist bat dong bo.
	 */
	recordUsage(id: string, actualCost: number): void {
		const key = this.keys.get(id);
		if (!key) return;
		key.unitsConsumedToday += actualCost;
		key.consecutiveErrorCount = 0;

		void this.keyService
			.persistUsage(id, {
				unitsConsumedToday: key.unitsConsumedToday,
				lastUsedAt: new Date(),
				consecutiveErrorCount: 0,
			})
			.catch((err) => {
				this.logger.warn(
					`Persist usage id=${id} failed: ${err.message}`,
				);
			});
	}

	/**
	 * Danh dau key exhausted quota (403 quotaExceeded / dailyLimitExceeded).
	 * Key se skip cho toi khi reset cron chay.
	 */
	markKeyExhausted(id: string, reason?: string): void {
		const key = this.keys.get(id);
		if (!key) return;
		key.status = YoutubeApiKeyStatus.QUOTA_EXCEEDED;
		key.unitsConsumedToday = key.dailyQuotaLimit;
		key.lastError = reason ?? 'quotaExceeded';
		this.logger.warn(
			`YouTube key alias=${key.alias} marked QUOTA_EXCEEDED: ${key.lastError}`,
		);
		void this.keyService
			.persistUsage(id, {
				status: YoutubeApiKeyStatus.QUOTA_EXCEEDED,
				unitsConsumedToday: key.unitsConsumedToday,
				lastError: key.lastError,
			})
			.catch((err) => {
				this.logger.warn(
					`Persist exhausted id=${id} failed: ${err.message}`,
				);
			});
	}

	/**
	 * Danh dau key invalid (403 keyInvalid / accessNotConfigured / API disabled).
	 * Admin phai xu ly thu cong.
	 */
	markKeyInvalid(id: string, reason: string): void {
		const key = this.keys.get(id);
		if (!key) return;
		key.status = YoutubeApiKeyStatus.INVALID;
		key.lastError = reason;
		key.consecutiveErrorCount += 1;
		this.logger.error(
			`YouTube key alias=${key.alias} marked INVALID: ${reason}`,
		);
		void this.keyService
			.persistUsage(id, {
				status: YoutubeApiKeyStatus.INVALID,
				lastError: reason,
				consecutiveErrorCount: key.consecutiveErrorCount,
			})
			.catch((err) => {
				this.logger.warn(
					`Persist invalid id=${id} failed: ${err.message}`,
				);
			});
	}

	/**
	 * Debug: xem trang thai hien tai pool.
	 */
	getPoolStats() {
		const items = Array.from(this.keys.values()).map((k) => ({
			id: k.id,
			alias: k.alias,
			status: k.status,
			unitsConsumedToday: k.unitsConsumedToday,
			dailyQuotaLimit: k.dailyQuotaLimit,
			unitsRemaining: Math.max(
				0,
				k.dailyQuotaLimit - k.unitsConsumedToday,
			),
		}));
		const totalRemaining = items
			.filter((i) => i.status === YoutubeApiKeyStatus.ACTIVE)
			.reduce((s, i) => s + i.unitsRemaining, 0);
		return {
			totalKeys: items.length,
			activeKeys: items.filter(
				(i) => i.status === YoutubeApiKeyStatus.ACTIVE,
			).length,
			totalRemainingUnits: totalRemaining,
			keys: items,
		};
	}

	/**
	 * Cron reset quota. YouTube reset tai 00:00 Pacific Time (~ 08:00 UTC).
	 */
	@Cron('0 8 * * *', { timeZone: 'UTC' })
	async resetDailyQuotas(): Promise<void> {
		try {
			this.logger.log('Running daily YouTube quota reset...');
			const { affected } = await this.keyService.resetAllQuotaCounters();
			this.logger.log(
				`Reset ${affected} YouTube API key(s) counter to 0`,
			);
			await this.reload();
		} catch (err: any) {
			this.logger.error(`Daily quota reset failed: ${err.message}`);
		}
	}
}
