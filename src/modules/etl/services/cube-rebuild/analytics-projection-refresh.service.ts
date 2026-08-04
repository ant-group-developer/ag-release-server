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
 * ClickHouse materialized views handle pure inserts, but do not account for
 * DELETE mutations or exchange-rate changes. All import entry points therefore
 * call this service once after their fact writes complete. It refreshes only
 * the affected month partitions and serializes concurrent refreshes for the
 * same partition across application processes.
 */
@Injectable()
export class AnalyticsProjectionRefreshService {
	private readonly logger = new Logger(
		AnalyticsProjectionRefreshService.name,
	);
	private readonly lockTtlMs = 60 * 60 * 1000;
	private readonly lockTimeoutMs = 10 * 60 * 1000;

	constructor(
		private readonly exchangeRateService: ExchangeRateService,
		private readonly cubeRebuildService: CubeRebuildService,
		@InjectRedis() private readonly redis: Redis,
	) {}

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
