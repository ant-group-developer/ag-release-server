// cache/cache.service.ts

import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class Cache2Service {
	constructor(
		@InjectRedis()
		private readonly redis: Redis,
	) {}

	async get<T>({ key }: { key: string }): Promise<T | null> {
		const value = await this.redis.get(key);

		if (!value) {
			return null;
		}

		return JSON.parse(value) as T;
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
		const data = JSON.stringify(value);

		if (ttl) {
			await this.redis.set(key, data, 'EX', ttl);
			return;
		}

		await this.redis.set(key, data);
	}

	async delete({ key }: { key: string }): Promise<void> {
		await this.redis.del(key);
	}

	async deleteByPattern({ pattern }: { pattern: string }): Promise<void> {
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
	}

	async wrap<T>({
		key,
		ttl,
		factory,
	}: {
		key: string; // {module}:{resource}:{identifier}:{extra}
		ttl?: number;
		factory: () => Promise<T>;
	}): Promise<T> {
		const cached = await this.get<T>({ key });

		if (cached !== null) {
			return cached;
		}

		const value = await factory();

		await this.set<T>({
			key,
			value,
			ttl,
		});

		return value;
	}
}
