import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { Cache } from 'cache-manager';

@Injectable()
export class CacheService {
	constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

	async get<T>(key: string): Promise<T | undefined> {
		return await this.cacheManager.get<T>(key);
	}

	async set<T>(key: string, value: T, ttl?: number): Promise<void> {
		await this.cacheManager.set(key, value, ttl);
	}

	async del(key: string): Promise<void> {
		await this.cacheManager.del(key);
	}
}
