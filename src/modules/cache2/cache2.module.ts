// cache/cache.module.ts

import { RedisModule, InjectRedis } from '@nestjs-modules/ioredis';
import { Global, Module, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { Cache2Controller } from './cache2.controller';
import { Cache2Service } from './cache2.service';

@Global()
@Module({
	imports: [
		RedisModule.forRoot({
			type: 'single',
			options: {
				host: process.env.REDIS_HOST,
				port: Number(process.env.REDIS_PORT),
				password: process.env.REDIS_PASSWORD,
				db: Number(process.env.REDIS_DB || 0),
			},
		}),
	],
	controllers: [Cache2Controller],
	providers: [Cache2Service],
	exports: [Cache2Service],
})
export class Cache2Module {
	private readonly logger = new Logger(Cache2Module.name);

	constructor(
		@InjectRedis()
		private readonly redis: Redis,
	) {
		this.redis.on('error', (err) => {
			this.logger.error(`Redis (ioredis) connection error: ${err.message}`);
		});
	}
}
