import {
	CACHE_MANAGER,
	CacheModule as NestCacheModule,
} from '@nestjs/cache-manager';
import { Inject, Logger, Module } from '@nestjs/common';
import { Cache } from 'cache-manager';
import * as redisStore from 'cache-manager-redis-store';
import { CacheController } from './cache.controller';
import { CacheService } from './cache.service';

@Module({
	imports: [
		NestCacheModule.register({
			store: redisStore,
			host: 'localhost',
			port: 6379,
			ttl: 600,
			max: 100,
		}),
	],
	controllers: [CacheController],
	providers: [CacheService],
	exports: [CacheService],
})
export class CacheModule {
	private readonly logger = new Logger(CacheModule.name);

	constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {
		const store = (this.cacheManager as any).store;
		if (store && typeof store.getClient === 'function') {
			const client = store.getClient();
			if (client && typeof client.on === 'function') {
				client.on('error', (err: any) => {
					this.logger.error(
						`CacheManager Redis connection error: ${err.message}`,
					);
				});
			}
		}
	}
}
