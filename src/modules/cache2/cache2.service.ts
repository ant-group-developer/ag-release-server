// cache/cache.service.ts

import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class Cache2Service {
	private readonly logger = new Logger(Cache2Service.name);

	constructor(
		@InjectRedis()
		private readonly redis: Redis,
	) {}

	async get<T>({ key }: { key: string }): Promise<T | null> {
		try {
			const value = await this.redis.get(key);
			if (!value) return null;
			return JSON.parse(value) as T;
		} catch (err) {
			this.logger.warn(
				`Redis get failed for key "${key}": ${err.message}`,
			);
			return null;
		}
	}

	async set<T>({
		key,
		value,
		ttl,
	}: {
		key: string;
		value: T;
		ttl?: number;
	}): Promise<void> {
		try {
			const data = JSON.stringify(value);
			if (ttl) {
				await this.redis.set(key, data, 'EX', ttl);
			} else {
				await this.redis.set(key, data);
			}
		} catch (err) {
			this.logger.warn(
				`Redis set failed for key "${key}": ${err.message}`,
			);
		}
	}

	async delete({ key }: { key: string }): Promise<void> {
		try {
			await this.redis.del(key);
		} catch (err) {
			this.logger.warn(
				`Redis delete failed for key "${key}": ${err.message}`,
			);
		}
	}

	async deleteByPattern({ pattern }: { pattern: string }): Promise<void> {
		try {
			let cursor = '0';
			do {
				const [nextCursor, keys] = await this.redis.scan(
					cursor,
					'MATCH',
					pattern,
					'COUNT',
					100,
				);
				cursor = nextCursor;
				if (keys.length > 0) {
					await this.redis.del(...keys);
				}
			} while (cursor !== '0');
		} catch (err) {
			this.logger.warn(
				`Redis deleteByPattern failed for pattern "${pattern}": ${err.message}`,
			);
		}
	}

	async wrap<T>({
		key,
		ttl,
		factory,
	}: {
		key: string;
		ttl?: number;
		factory: () => Promise<T>;
	}): Promise<T> {
		const cached = await this.get<T>({ key });

		if (cached !== null) {
			return cached;
		}

		const value = await factory();

		await this.set<T>({ key, value, ttl });

		return value;
	}
}
