import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { ExchangeRateService } from '../exchange-rate/exchange-rate.service';
import { CubeRebuildService } from './cube-rebuild.service';

export interface AnalyticsProjectionRefreshRequest {
	salesPeriods?: Iterable<string>;
	trendsPeriods?: Iterable<string>;
}

/**
 * Keeps analytics projections consistent after any fact-table import.
 *
 * Cubes are rebuild-only. Insert-triggered materialized views are dropped
 * (migration 050) because they cannot see DELETE mutations or exchange-rate
 * changes and they double-count while a period is still being synced. All
 * import entry points pause any leftover cube MVs around their fact writes,
 * then call this service once those writes complete. It refreshes only the
 * affected month partitions and serializes concurrent refreshes for the same
 * partition across application processes.
 */
@Injectable()
export class AnalyticsProjectionRefreshService {
	private readonly logger = new Logger(
		AnalyticsProjectionRefreshService.name,
	);
	private readonly lockTtlMs = 60 * 60 * 1000;
	private readonly lockTimeoutMs = 10 * 60 * 1000;
	private readonly cubeViewPauseKey = 'analytics-cube-mv-pause-count';

	constructor(
		private readonly exchangeRateService: ExchangeRateService,
		private readonly cubeRebuildService: CubeRebuildService,
		@InjectRedis() private readonly redis: Redis,
	) {}

	/**
	 * Pause leftover cube MVs around a multi-DSP fact write so cubes stay
	 * at the last rebuild until `refreshAfterFactImport` runs.
	 */
	async whileCubeViewsPaused<T>(work: () => Promise<T>): Promise<T> {
		const count = await this.redis.incr(this.cubeViewPauseKey);
		await this.redis.pexpire(this.cubeViewPauseKey, this.lockTtlMs);
		try {
			if (count === 1) {
				this.logger.log(
					'Pausing cube materialized views for fact import',
				);
				await this.cubeRebuildService.pauseCubeMaterializedViews();
			}
			return await work();
		} finally {
			const remaining = await this.redis.decr(this.cubeViewPauseKey);
			if (remaining <= 0) {
				await this.redis.del(this.cubeViewPauseKey);
				this.logger.log('Resuming cube materialized views');
				await this.cubeRebuildService.resumeCubeMaterializedViews();
			} else {
				await this.redis.pexpire(this.cubeViewPauseKey, this.lockTtlMs);
			}
		}
	}

	async refreshAfterFactImport(
		request: AnalyticsProjectionRefreshRequest,
	): Promise<void> {
		const salesPeriods = this.normalizePeriods(request.salesPeriods);
		const trendsPeriods = this.normalizePeriods(request.trendsPeriods);
		if (!salesPeriods.length && !trendsPeriods.length) return;

		const lockKeys = [
			...salesPeriods.map(
				(period) => `analytics-cube-refresh:sales:${period}`,
			),
			...trendsPeriods.map(
				(period) => `analytics-cube-refresh:trends:${period}`,
			),
		].sort();
		const token = `${process.pid}:${Date.now()}:${Math.random()}`;
		const acquired: string[] = [];

		try {
			for (const key of lockKeys) {
				await this.acquireLock(key, token);
				acquired.push(key);
			}

			if (salesPeriods.length) {
				this.logger.log(
					`Refreshing sales cubes for ${salesPeriods.join(', ')}`,
				);
				await this.exchangeRateService.syncMonthsForPeriods(
					salesPeriods,
				);
				await this.cubeRebuildService.rebuildSalesCubesForPeriods(
					salesPeriods,
				);
			}
			if (trendsPeriods.length) {
				this.logger.log(
					`Refreshing trends cubes for ${trendsPeriods.join(', ')}`,
				);
				await this.cubeRebuildService.rebuildTrendsCubesForPeriods(
					trendsPeriods,
				);
			}
		} finally {
			await Promise.all(
				acquired.reverse().map((key) => this.releaseLock(key, token)),
			);
		}
	}

	private normalizePeriods(periods?: Iterable<string>): string[] {
		if (!periods) return [];
		return [
			...new Set(
				[...periods]
					.map((period) => period.replace(/-/g, '').slice(0, 6))
					.filter((period) => /^\d{6}$/.test(period)),
			),
		]
			.map((period) => `${period.slice(0, 4)}-${period.slice(4, 6)}`)
			.sort();
	}

	private async acquireLock(key: string, token: string): Promise<void> {
		const startedAt = Date.now();
		while (Date.now() - startedAt < this.lockTimeoutMs) {
			const acquired = await this.redis.set(
				key,
				token,
				'PX',
				this.lockTtlMs,
				'NX',
			);
			if (acquired === 'OK') return;
			await new Promise((resolve) => setTimeout(resolve, 250));
		}
		throw new Error(
			`Timed out waiting to refresh analytics cube partition (${key})`,
		);
	}

	private async releaseLock(key: string, token: string): Promise<void> {
		await this.redis
			.eval(
				"if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0",
				1,
				key,
				token,
			)
			.catch((error) =>
				this.logger.warn(
					`Failed to release cube refresh lock ${key}: ${error.message}`,
				),
			);
	}
}
