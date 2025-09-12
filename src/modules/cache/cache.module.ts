import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
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
export class CacheModule {}
