import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { SetCacheDto } from './dto/cache.dto';
import { EntityCache } from './enum/cache.enum';

@Injectable()
export class CacheService {
	constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

	async get<T>(input: {
		entity: EntityCache;
		key: string;
	}): Promise<T | undefined> {
		return await this.cacheManager.get<T>(this.getFullKey(input));
	}

	async bulkSet(input: SetCacheDto[]): Promise<void> {
		await Promise.all(input.map((i) => this.set(i)));
	}

	async set(input: SetCacheDto): Promise<void> {
		const { value, ttl } = input;
		await this.cacheManager.set(this.getFullKey(input), value, ttl);
	}

	async del(input: { entity: EntityCache; key: string }): Promise<void> {
		await this.cacheManager.del(this.getFullKey(input));
	}

	/**
	 * Delete all cache keys matching a prefix pattern.
	 * Useful for invalidating all auth contexts for a tenant.
	 * Example: delByPrefix({ entity: AUTH_CONTEXT, prefix: '*_tenantId' })
	 */
	async delByPrefix(input: {
		entity: EntityCache;
		prefix: string;
	}): Promise<void> {
		const store = (this.cacheManager as any).store;
		if (!store?.getClient) return;

		const client = store.getClient();
		const pattern = `${input.entity}_${input.prefix}`;
		const keys: string[] = await new Promise((resolve, reject) => {
			client.keys(pattern, (err: Error | null, result: string[]) => {
				if (err) reject(err);
				else resolve(result ?? []);
			});
		});

		if (keys.length > 0) {
			await Promise.all(
				keys.map((key: string) => this.cacheManager.del(key)),
			);
		}
	}

	private getFullKey({ entity, key }: { entity: EntityCache; key: string }) {
		return entity + '_' + key;
	}
}
