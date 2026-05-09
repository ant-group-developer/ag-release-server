// cache/cache.module.ts

import { RedisModule } from '@nestjs-modules/ioredis';
import { Global, Module } from '@nestjs/common';
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
export class Cache2Module {}
