// cache/cache.controller.ts

import { Body, Controller, Delete, Get, Post, Query } from '@nestjs/common';
import { Cache2Service } from './cache2.service';

@Controller('cache2')
export class Cache2Controller {
	constructor(private readonly cacheService: Cache2Service) {}

	@Get()
	async get(@Query('key') key: string) {
		const value = await this.cacheService.get({
			key,
		});

		return {
			key,
			value,
		};
	}

	@Post()
	async set(
		@Body()
		body: {
			key: string;
			value: unknown;
			ttl?: number;
		},
	) {
		await this.cacheService.set({
			key: body.key,
			value: body.value,
			ttl: body.ttl,
		});

		return {
			success: true,
		};
	}

	@Delete()
	async delete(@Query('key') key: string) {
		await this.cacheService.delete({
			key,
		});

		return {
			success: true,
		};
	}

	@Delete('pattern')
	async deleteByPattern(@Query('pattern') pattern: string) {
		await this.cacheService.deleteByPattern({
			pattern,
		});

		return {
			success: true,
		};
	}
}
